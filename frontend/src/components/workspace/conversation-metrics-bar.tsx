import type { ConversationMetrics } from '@/lib/types';

function formatTokens(n: number): string {
  // Use Math.round to avoid JS banker's rounding in toFixed (e.g. 12450 → 12.5k not 12.4k)
  return n >= 10_000 ? `${(Math.round(n / 100) / 10).toFixed(1)}k` : n.toLocaleString();
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

interface ContextRingProps {
  ratio: number; // 0–1
}

function ContextRing({ ratio }: ContextRingProps) {
  const r = 7;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(ratio, 1));
  const stroke = ratio > 0.9 ? '#ef4444' : ratio > 0.75 ? '#f59e0b' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" className="shrink-0 opacity-60">
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2" opacity={0.2} />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}

interface ConversationMetricsBarProps {
  metrics: ConversationMetrics;
}

const SEP = <span className="text-muted-foreground/25 select-none">·</span>;

export function ConversationMetricsBar({ metrics }: ConversationMetricsBarProps) {
  const {
    provider,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    limitTokens,
    totalCost,
    responseTimeMs,
  } = metrics;

  const ratio = limitTokens && limitTokens > 0 ? totalTokens / limitTokens : null;

  const parts: React.ReactNode[] = [];

  if (ratio !== null) {
    parts.push(
      <span key="ctx" className="flex items-center gap-1">
        <span>{(ratio * 100).toFixed(1)}%</span>
        <ContextRing ratio={ratio} />
      </span>,
    );
  }

  if (responseTimeMs !== null) {
    parts.push(<span key="time">⏱ {formatDuration(responseTimeMs)}</span>);
  }

  parts.push(
    <span key="tokens">
      ↑ {formatTokens(promptTokens)} ↓ {formatTokens(completionTokens)}
    </span>,
  );

  parts.push(<span key="model">{model} · {provider}</span>);

  if (totalCost > 0) {
    parts.push(<span key="cost">{formatCost(totalCost)}</span>);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mt-1.5 ml-0.5 text-[11px] text-muted-foreground/50">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && SEP}
          {part}
        </span>
      ))}
    </div>
  );
}
