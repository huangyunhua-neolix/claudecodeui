/**
 * Anthropic API Proxy
 *
 * Sits between Claude CLI subprocess and the real upstream API (copilot-api).
 * Claude CLI's settings.json ANTHROPIC_BASE_URL points here; we read the
 * real upstream from settings.json._anthropic_upstream_url and forward
 * after transforming parameters for non-Anthropic models:
 *   - GPT / O-series models: max_tokens -> max_completion_tokens
 *
 * This route is intentionally unauthenticated because it is only accessed
 * by the locally-spawned Claude CLI subprocess.
 */

import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';

const router = express.Router();

const CLAUDE_SETTINGS_PATH = path.join(
  os.homedir(),
  '.claude',
  'settings.json'
);

async function GetUpstreamUrl() {
  try {
    const content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf8');
    const settings = JSON.parse(content);
    return settings._anthropic_upstream_url || 'https://api.anthropic.com';
  } catch {
    return 'https://api.anthropic.com';
  }
}

/**
 * Returns true when the model requires max_completion_tokens instead of
 * max_tokens (OpenAI GPT / O-series models).
 */
function NeedsMaxCompletionTokens(model) {
  if (!model) return false;
  const lower = model.toLowerCase();
  return lower.startsWith('gpt') || /^o\d/.test(lower);
}

// Catch-all: forward every request to the real ANTHROPIC_BASE_URL
router.all('/*', async (req, res) => {
  try {
    const upstream_url = await GetUpstreamUrl();
    const target_path = req.params[0] || '';
    const target_url = `${upstream_url}/${target_path}`;

    // Clone incoming headers, removing hop-by-hop entries
    const forward_headers = { ...req.headers };
    delete forward_headers.host;
    delete forward_headers['content-length'];

    let body = req.body;

    // Transform max_tokens -> max_completion_tokens for GPT / O-series models
    if (body && typeof body === 'object' && NeedsMaxCompletionTokens(body.model)) {
      if ('max_tokens' in body && !('max_completion_tokens' in body)) {
        body = { ...body };
        body.max_completion_tokens = body.max_tokens;
        delete body.max_tokens;
        console.log(
          `[anthropic-proxy] Transformed max_tokens -> max_completion_tokens for model: ${body.model}`
        );
      }
    }

    const has_body = !['GET', 'HEAD'].includes(req.method);
    const body_str = has_body && body ? JSON.stringify(body) : undefined;

    if (body_str) {
      forward_headers['content-length'] = Buffer.byteLength(body_str).toString();
    }

    const upstream_response = await fetch(target_url, {
      method: req.method,
      headers: forward_headers,
      body: body_str,
    });

    // Relay status code
    res.status(upstream_response.status);

    // Relay response headers (skip transfer-encoding to avoid conflicts)
    upstream_response.headers.forEach((value, name) => {
      if (name.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(name, value);
      }
    });

    // Stream the response body back to the caller
    upstream_response.body.pipe(res);
  } catch (error) {
    console.error('[anthropic-proxy] Error:', error.message);
    res.status(502).json({ error: 'Proxy error', message: error.message });
  }
});

export default router;
