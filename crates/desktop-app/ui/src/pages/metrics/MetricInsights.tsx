import type { UsageTotals, UsageAggregates } from './types'
import { formatTokens, formatCost } from './helpers'

function Tile({ label, value, sub, dim }: { label: string; value: string; sub?: string; dim?: boolean }) {
  return (
    <div className="flex flex-col gap-1 bg-bg-panel border border-border-strong rounded-lg p-4">
      <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-text-dim">{label}</span>
      <span className={`font-mono text-[22px] font-semibold tracking-[-0.01em] leading-none ${dim ? 'text-text-muted text-lg' : 'text-text-primary'}`}>{value}</span>
      {sub && <span className="font-mono text-[10px] text-text-dim">{sub}</span>}
    </div>
  )
}

function InsightList({ title, rows }: { title: string; rows: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className="flex flex-col gap-2 bg-bg-card border border-border-line rounded-md p-4">
      <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-text-dim mb-1">{title}</div>
      {rows.length === 0
        ? <div className="text-[12px] text-text-dim">No data</div>
        : rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2 py-[3px] border-b border-border-line last:border-b-0">
            <span className="text-[12px] text-text-primary overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0">{r.label}</span>
            <span className="flex items-center gap-1.5 flex-shrink-0 font-mono text-[12px] text-text-primary tabular-nums">
              {r.value}
              {r.sub && <span className="text-[10px] text-text-dim ml-1">{r.sub}</span>}
            </span>
          </div>
        ))
      }
    </div>
  )
}

export function MetricInsights({
  totals,
  aggregates,
  sessionCount,
  loading,
}: {
  totals: UsageTotals | null
  aggregates: UsageAggregates
  sessionCount: number
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-[78px] bg-bg-elevated border border-border-line rounded-lg"
            style={{
              backgroundImage: 'linear-gradient(90deg, var(--ds-bg-elevated) 0%, var(--ds-bg-overlay) 40%, var(--ds-bg-panel) 50%, var(--ds-bg-overlay) 60%, var(--ds-bg-elevated) 100%)',
              backgroundSize: '220% 100%',
              animation: 'rd-skeleton-shimmer 1.6s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    )
  }

  const topModels = aggregates.byModel.slice(0, 5).map(e => ({
    label: e.model ?? 'unknown',
    value: formatCost(e.totals.totalCost ?? 0),
    sub: formatTokens(e.totals.totalTokens ?? 0),
  }))
  const topProviders = aggregates.byProvider.slice(0, 5).map(e => ({
    label: e.provider ?? 'unknown',
    value: formatCost(e.totals.totalCost ?? 0),
    sub: formatTokens(e.totals.totalTokens ?? 0),
  }))

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
        <Tile label="Total tokens"      value={totals ? formatTokens(totals.totalTokens) : '—'} sub={totals ? `${formatTokens(totals.input)} in · ${formatTokens(totals.output)} out` : undefined} />
        <Tile label="Total cost"        value={totals ? formatCost(totals.totalCost) : '—'} sub={totals ? `${formatCost(totals.inputCost)} in · ${formatCost(totals.outputCost)} out` : undefined} />
        <Tile label="Avg cost / session" value={totals && sessionCount ? formatCost(totals.totalCost / sessionCount) : '—'} />
        <Tile label="Sessions"          value={String(sessionCount)} />
        <Tile label="Models used"       value={String(aggregates.byModel.length)} sub={aggregates.byProvider.length ? `${aggregates.byProvider.length} provider${aggregates.byProvider.length > 1 ? 's' : ''}` : undefined} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InsightList title="Top models"    rows={topModels} />
        <InsightList title="Top providers" rows={topProviders} />
      </div>
    </div>
  )
}
