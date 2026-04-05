import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ChatMessage } from '../../types/types';
import type { SessionProvider } from '../../../../types/app';
import AssistantThinkingIndicator from './AssistantThinkingIndicator';
import { Markdown } from './Markdown';

interface RawOutputPaneProps {
  scrollContainerRef: RefObject<HTMLDivElement>;
  onWheel: () => void;
  onTouchMove: () => void;
  chatMessages: ChatMessage[];
  visibleMessages: ChatMessage[];
  provider: SessionProvider;
  isLoading: boolean;
}

/**
 * Extracts raw text content from a ChatMessage without any formatting.
 * Shows exactly what the model returns.
 */
function ExtractRawContent(message: ChatMessage): string {
  const parts: string[] = [];

  // Skip thinking/reasoning blocks
  if (message.isThinking) return '';

  if (message.content) {
    parts.push(String(message.content));
  }

  if (message.toolName) {
    let tool_line = `[Tool: ${message.toolName}]`;
    if (message.toolInput) {
      try {
        const input_str = typeof message.toolInput === 'string'
          ? message.toolInput
          : JSON.stringify(message.toolInput, null, 2);
        tool_line += `\n${input_str}`;
      } catch {
        tool_line += ` ${String(message.toolInput)}`;
      }
    }
    parts.push(tool_line);
  }

  if (message.toolResult) {
    const result = message.toolResult;
    const result_content = result.content ?? result.toolUseResult;
    if (result_content) {
      try {
        const result_str = typeof result_content === 'string'
          ? result_content
          : JSON.stringify(result_content, null, 2);
        parts.push(result_str);
      } catch {
        parts.push(String(result_content));
      }
    }
  }

  return parts.join('\n');
}

function RawMessageLine({ message }: { message: ChatMessage }) {
  const raw_content = ExtractRawContent(message);
  if (!raw_content.trim()) return null;

  const is_user = message.type === 'user';
  const is_error = message.type === 'error';
  const is_tool = !!message.toolName;

  if (is_user) {
    return (
      <div className="text-sky-400">
        <span className="text-sky-500 font-bold select-none">{`❯ `}</span>
        <span className="whitespace-pre-wrap break-words">{raw_content}</span>
      </div>
    );
  }

  if (is_error) {
    return (
      <div className="text-red-400">
        <span className="text-red-500 font-bold select-none">{`✗ `}</span>
        <span className="whitespace-pre-wrap break-words">{raw_content}</span>
      </div>
    );
  }

  if (is_tool) {
    return (
      <div className="text-gray-400 text-xs border-l-2 border-gray-700 pl-2 my-1">
        <span className="whitespace-pre-wrap break-words">{raw_content}</span>
      </div>
    );
  }

  // Assistant message — render with Markdown
  return (
    <div className="text-gray-200">
      <Markdown className="prose prose-sm prose-invert max-w-none">
        {raw_content}
      </Markdown>
    </div>
  );
}

export default function RawOutputPane({
  scrollContainerRef,
  onWheel,
  onTouchMove,
  chatMessages,
  visibleMessages,
  provider,
  isLoading,
}: RawOutputPaneProps) {
  const bottom_anchor_ref = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottom_anchor_ref.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages.length, visibleMessages[visibleMessages.length - 1]?.content]);

  const messages_to_show = visibleMessages;

  return (
    <div
      ref={scrollContainerRef}
      onWheel={onWheel}
      onTouchMove={onTouchMove}
      className="relative flex-1 overflow-y-auto overflow-x-hidden bg-gray-950 font-mono text-sm leading-relaxed"
    >
      <div className="min-h-full p-4 space-y-1">
        {messages_to_show.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-600">
            <span>Waiting for input...</span>
          </div>
        ) : (
          messages_to_show.map((message) => {
            const key = `${message.type}-${message.timestamp}-${message.toolId || ''}-${String(message.content || '').slice(0, 32)}`;
            return <RawMessageLine key={key} message={message} />;
          })
        )}

        {isLoading && (
          <div className="py-2">
            <AssistantThinkingIndicator selectedProvider={provider} />
          </div>
        )}

        <div ref={bottom_anchor_ref} />
      </div>
    </div>
  );
}
