import { SessionProvider } from '../../../../types/app';
import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';

type AssistantThinkingIndicatorProps = {
  selectedProvider: SessionProvider;
  streamingPreview?: string;
}


export default function AssistantThinkingIndicator({ selectedProvider, streamingPreview }: AssistantThinkingIndicatorProps) {
  const providerName = selectedProvider === 'cursor' ? 'Cursor' : selectedProvider === 'codex' ? 'Codex' : selectedProvider === 'gemini' ? 'Gemini' : 'Claude';
  const hasPreview = streamingPreview && streamingPreview.trim().length > 0;

  return (
    <div className="chat-message assistant">
      <div className="w-full">
        <div className="mb-2 flex items-center space-x-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-transparent p-1 text-sm text-white">
            <SessionProviderLogo provider={selectedProvider} className="h-full w-full" />
          </div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {providerName}
          </div>
        </div>
        <div className="w-full pl-3 text-sm text-gray-500 dark:text-gray-400 sm:pl-0">
          {hasPreview ? (
            <div className="space-y-1">
              <div className="flex items-center space-x-1 text-xs text-blue-500 dark:text-blue-400">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                <span>Generating...</span>
              </div>
              <div className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-sm text-foreground">
                {streamingPreview}
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-1">
              <div className="animate-pulse">.</div>
              <div className="animate-pulse" style={{ animationDelay: '0.2s' }}>.</div>
              <div className="animate-pulse" style={{ animationDelay: '0.4s' }}>.</div>
              <span className="ml-2">Thinking...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
