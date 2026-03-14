import type { SessionSummary } from '@/lib/types';

interface Props {
  session: SessionSummary;
  estimatedPromptTokens: number;
  systemPromptTokens: number;
  messageCount: number;
  toolCallCount: number;
  runCount: number;
}

export function TokenUsageBar({
  session,
  estimatedPromptTokens,
  systemPromptTokens,
  messageCount,
  toolCallCount,
  runCount,
}: Props) {
  const cw = session.contextWindow;
  const ratio = cw?.limitTokens ? estimatedPromptTokens / cw.limitTokens : null;

  return (
    <div className="flex-shrink-0 border border-border rounded-lg p-3 bg-card space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Context Window</span>
        <span>
          {cw?.provider ?? '—'} · {cw?.model ?? '—'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          {ratio != null ? (
            <div
              className={`h-full rounded-full transition-all ${
                ratio > 0.85
                  ? 'bg-destructive'
                  : ratio > 0.6
                    ? 'bg-warning'
                    : 'bg-success'
              }`}
              style={{ width: `${Math.min(100, ratio * 100).toFixed(1)}%` }}
            />
          ) : (
            <div className="h-full bg-sky-400 rounded-full" style={{ width: '8px' }} />
          )}
        </div>
        <div className="text-xs font-mono text-muted-foreground whitespace-nowrap">
          ~{estimatedPromptTokens.toLocaleString()} / {cw?.limitTokens?.toLocaleString() ?? '?'} tok
          <span className="ml-1 text-muted-foreground/60">
            (~{systemPromptTokens.toLocaleString()} sys)
          </span>
          {cw?.promptTokens != null && (
            <span className="ml-2 text-muted-foreground/40">
              · last run: {cw.promptTokens.toLocaleString()}p
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>{messageCount} messages</span>
        <span>{toolCallCount} tool calls</span>
        <span>{runCount} runs</span>
      </div>
    </div>
  );
}
