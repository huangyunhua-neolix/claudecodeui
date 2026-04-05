/**
 * Claude CLI Integration (Child Process)
 *
 * Spawns `claude` CLI as a subprocess with --output-format stream-json,
 * parses streaming JSON output, and relays normalized messages to the frontend
 * via WebSocket. Mirrors the interface of cursor-cli.js.
 */

import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import crossSpawn from 'cross-spawn';
import os from 'os';
import path from 'path';
import { notifyRunFailed, notifyRunStopped } from './services/notification-orchestrator.js';
import { claudeAdapter } from './providers/claude/adapter.js';
import { createNormalizedMessage } from './providers/types.js';

const spawnFunction = process.platform === 'win32' ? crossSpawn : spawn;

const activeClaudeProcesses = new Map();

/**
 * Resolve the absolute path to the `claude` binary.
 * Falls back to common install locations if not found in PATH.
 */
function FindClaudeBinary() {
  try {
    const bin = execSync('which claude', { encoding: 'utf8' }).trim();
    if (bin) return bin;
  } catch { /* not in PATH */ }

  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  return 'claude';
}

/**
 * Spawns `claude` CLI as a child process and streams output to WebSocket.
 */
async function SpawnClaude(command, options = {}, ws) {
  return new Promise(async (resolve, reject) => {
    const {
      sessionId,
      projectPath,
      cwd,
      resume,
      toolsSettings,
      permissionMode,
      model,
      sessionSummary,
    } = options;

    let captured_session_id = sessionId;
    let session_created_sent = false;
    let settled = false;

    const settings = toolsSettings || {
      allowedTools: [],
      disallowedTools: [],
      skipPermissions: false,
    };

    // Build claude CLI arguments
    const base_args = [];

    // Resume existing session
    if (sessionId) {
      base_args.push('--resume', sessionId);
    }

    if (command && command.trim()) {
      // Non-interactive print mode with streaming JSON output
      base_args.push('-p', command);
      base_args.push('--output-format', 'stream-json');
      base_args.push('--verbose');
      base_args.push('--include-partial-messages');

      // Don't pass --model here; let Claude CLI read ANTHROPIC_MODEL
      // from ~/.claude/settings.json so model selection via Settings UI works.
    }

    // Permission mode
    if (permissionMode === 'bypassPermissions' || settings.skipPermissions) {
      base_args.push('--dangerously-skip-permissions');
      console.log('Using --dangerously-skip-permissions flag');
    } else if (permissionMode === 'acceptEdits') {
      base_args.push('--permission-mode', 'acceptEdits');
    } else if (permissionMode === 'plan') {
      base_args.push('--permission-mode', 'plan');
    } else if (permissionMode && permissionMode !== 'default') {
      base_args.push('--permission-mode', permissionMode);
    }

    // Allowed tools
    if (settings.allowedTools && settings.allowedTools.length > 0) {
      base_args.push('--allowedTools', ...settings.allowedTools);
    }

    // Disallowed tools
    if (settings.disallowedTools && settings.disallowedTools.length > 0) {
      base_args.push('--disallowedTools', ...settings.disallowedTools);
    }

    const working_dir_candidate = cwd || projectPath || process.cwd();
    const working_dir = existsSync(working_dir_candidate)
      ? working_dir_candidate
      : process.cwd();
    const process_key = captured_session_id || Date.now().toString();

    const SettleOnce = (callback) => {
      if (settled) return;
      settled = true;
      callback();
    };

    let stdout_line_buffer = '';
    let terminal_notification_sent = false;

    const NotifyTerminalState = ({ code = null, error = null } = {}) => {
      if (terminal_notification_sent) return;
      terminal_notification_sent = true;

      const final_session_id = captured_session_id || sessionId || process_key;
      if (code === 0 && !error) {
        notifyRunStopped({
          userId: ws?.userId || null,
          provider: 'claude',
          sessionId: final_session_id,
          sessionName: sessionSummary,
          stopReason: 'completed',
        });
      } else {
        notifyRunFailed({
          userId: ws?.userId || null,
          provider: 'claude',
          sessionId: final_session_id,
          sessionName: sessionSummary,
          error: error || `Claude CLI exited with code ${code}`,
        });
      }
    };

    const claude_bin = FindClaudeBinary();
    console.log('Spawning Claude CLI:', claude_bin, base_args.join(' '));
    console.log('Working directory:', working_dir);
    console.log(
      'Session info - Input sessionId:',
      sessionId,
      'Resume:',
      resume
    );

    const claude_process = spawnFunction(claude_bin, base_args, {
      cwd: working_dir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    activeClaudeProcesses.set(process_key, claude_process);

    const ProcessOutputLine = (line) => {
      if (!line || !line.trim()) return;

      try {
        const response = JSON.parse(line);

        switch (response.type) {
          case 'system': {
            if (response.subtype === 'init') {
              if (response.session_id && !captured_session_id) {
                captured_session_id = response.session_id;
                console.log('Captured Claude session ID:', captured_session_id);

                if (process_key !== captured_session_id) {
                  activeClaudeProcesses.delete(process_key);
                  activeClaudeProcesses.set(captured_session_id, claude_process);
                }

                if (ws.setSessionId && typeof ws.setSessionId === 'function') {
                  ws.setSessionId(captured_session_id);
                }

                if (!sessionId && !session_created_sent) {
                  session_created_sent = true;
                  ws.send(
                    createNormalizedMessage({
                      kind: 'session_created',
                      newSessionId: captured_session_id,
                      model: response.model,
                      cwd: response.cwd,
                      sessionId: captured_session_id,
                      provider: 'claude',
                    })
                  );
                }
              }
            }
            break;
          }

          case 'user':
            // User messages echoed back — skip.
            break;

          case 'assistant': {
            if (
              response.message &&
              response.message.role !== 'user' &&
              response.message.content &&
              response.message.content.length > 0
            ) {
              const normalized = claudeAdapter.normalizeMessage(
                response,
                captured_session_id || sessionId || null
              );
              for (const msg of normalized) ws.send(msg);
            }
            break;
          }

          case 'content_block_delta': {
            // Streaming text delta
            const normalized = claudeAdapter.normalizeMessage(
              response,
              captured_session_id || sessionId || null
            );
            for (const msg of normalized) ws.send(msg);
            break;
          }

          case 'content_block_stop': {
            const normalized = claudeAdapter.normalizeMessage(
              response,
              captured_session_id || sessionId || null
            );
            for (const msg of normalized) ws.send(msg);
            break;
          }

          case 'result': {
            console.log('Claude session result:', response);
            const result_text =
              typeof response.result === 'string' ? response.result : '';

            // Extract token budget if available
            if (response.modelUsage) {
              const model_key = Object.keys(response.modelUsage)[0];
              const model_data = response.modelUsage?.[model_key];
              if (model_data) {
                const input_tokens =
                  model_data.cumulativeInputTokens ||
                  model_data.inputTokens ||
                  0;
                const output_tokens =
                  model_data.cumulativeOutputTokens ||
                  model_data.outputTokens ||
                  0;
                const cache_read =
                  model_data.cumulativeCacheReadInputTokens ||
                  model_data.cacheReadInputTokens ||
                  0;
                const cache_create =
                  model_data.cumulativeCacheCreationInputTokens ||
                  model_data.cacheCreationInputTokens ||
                  0;
                const total_used =
                  input_tokens + output_tokens + cache_read + cache_create;
                const context_window =
                  parseInt(process.env.CONTEXT_WINDOW) || 160000;

                ws.send(
                  createNormalizedMessage({
                    kind: 'status',
                    text: 'token_budget',
                    tokenBudget: { used: total_used, total: context_window },
                    sessionId: captured_session_id || sessionId || null,
                    provider: 'claude',
                  })
                );
              }
            }

            ws.send(
              createNormalizedMessage({
                kind: 'complete',
                exitCode: response.subtype === 'success' ? 0 : 1,
                resultText: result_text,
                isError: response.subtype !== 'success',
                sessionId: captured_session_id || sessionId,
                provider: 'claude',
              })
            );
            break;
          }

          default: {
            // Pass unknown types through adapter
            const normalized = claudeAdapter.normalizeMessage(
              response,
              captured_session_id || sessionId || null
            );
            for (const msg of normalized) ws.send(msg);
          }
        }
      } catch {
        // Non-JSON output — send as raw stream delta
        console.log('Claude CLI non-JSON output:', line);
        ws.send(
          createNormalizedMessage({
            kind: 'stream_delta',
            content: line + '\n',
            sessionId: captured_session_id || sessionId || null,
            provider: 'claude',
          })
        );
      }
    };

    // Handle stdout streaming JSON
    claude_process.stdout.on('data', (data) => {
      const raw_output = data.toString();
      console.log('Claude CLI stdout:', raw_output);

      stdout_line_buffer += raw_output;
      const complete_lines = stdout_line_buffer.split(/\r?\n/);
      stdout_line_buffer = complete_lines.pop() || '';

      complete_lines.forEach((line) => {
        ProcessOutputLine(line.trim());
      });
    });

    // Handle stderr
    claude_process.stderr.on('data', (data) => {
      const stderr_text = data.toString();
      console.error('Claude CLI stderr:', stderr_text);

      ws.send(
        createNormalizedMessage({
          kind: 'error',
          content: stderr_text,
          sessionId: captured_session_id || sessionId || null,
          provider: 'claude',
        })
      );
    });

    // Handle process close
    claude_process.on('close', async (code) => {
      console.log(`Claude CLI process exited with code ${code}`);

      const final_session_id = captured_session_id || sessionId || process_key;
      activeClaudeProcesses.delete(final_session_id);

      // Flush remaining stdout buffer
      if (stdout_line_buffer.trim()) {
        ProcessOutputLine(stdout_line_buffer.trim());
        stdout_line_buffer = '';
      }

      ws.send(
        createNormalizedMessage({
          kind: 'complete',
          exitCode: code,
          isNewSession: !sessionId && !!command,
          sessionId: final_session_id,
          provider: 'claude',
        })
      );

      if (code === 0) {
        NotifyTerminalState({ code });
        SettleOnce(() => resolve());
      } else {
        NotifyTerminalState({ code });
        SettleOnce(() =>
          reject(new Error(`Claude CLI exited with code ${code}`))
        );
      }
    });

    // Handle process error
    claude_process.on('error', (error) => {
      console.error('Claude CLI process error:', error);

      const final_session_id = captured_session_id || sessionId || process_key;
      activeClaudeProcesses.delete(final_session_id);

      ws.send(
        createNormalizedMessage({
          kind: 'error',
          content: error.message,
          sessionId: captured_session_id || sessionId || null,
          provider: 'claude',
        })
      );
      NotifyTerminalState({ error });

      SettleOnce(() => reject(error));
    });

    // Close stdin — claude -p mode doesn't need interactive input
    claude_process.stdin.end();
  });
}

function AbortClaudeSession(sessionId) {
  const proc = activeClaudeProcesses.get(sessionId);
  if (proc) {
    console.log(`Aborting Claude CLI session: ${sessionId}`);
    proc.kill('SIGTERM');
    activeClaudeProcesses.delete(sessionId);
    return true;
  }
  return false;
}

function IsClaudeSessionActive(sessionId) {
  return activeClaudeProcesses.has(sessionId);
}

function GetActiveClaudeSessions() {
  return Array.from(activeClaudeProcesses.keys());
}

export {
  SpawnClaude,
  AbortClaudeSession,
  IsClaudeSessionActive,
  GetActiveClaudeSessions,
};
