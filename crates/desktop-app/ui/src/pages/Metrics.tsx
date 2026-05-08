import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getUsageMetrics, type UsageTotals } from '@/api/metrics'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'
import { cn } from '@/lib/cn'

export default function Metrics() {
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')
  const filters = useMemo(() => rangeToFilters(range), [range])
  const q = useQuery({
    queryKey: ['metrics', filters.start ?? 'all', filters.end ?? 'all'],
    queryFn: () => getUsageMetrics(filters),
  })
  const totals = q.data?.aggregates.totals

  return (
    <div className="settings-page">
      <SettingsPageHeader
        title="Metrics"
        lede="Tokens and cost rendered in tabular serif numerals — a ledger, not a dashboard. Breakdowns by provider, model, and day sit below."
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {(['7d', '30d', '90d', 'all'] as const).map((item) => {
            const isActive = item === range
            return (
              <button
                key={item}
                type="button"
                className={cn(
                  'border rounded-pill px-2.5 py-1.5 text-xs cursor-pointer transition-[border-color,color,background] duration-[140ms] ease-ease-cubic',
                  isActive
                    ? 'border-teal-400 bg-teal-soft text-text-primary'
                    : 'border-border-strong bg-bg-card text-text-muted hover:text-text-primary hover:border-teal-line',
                )}
                onClick={() => setRange(item)}
              >
                {rangeLabel(item)}
              </button>
            )
          })}
        </div>
        <span className="mono text-[11px] text-text-dim">
          {filters.start && filters.end ? `${filters.start} → ${filters.end}` : 'All recorded usage'}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        <StatTile label="Prompt tokens" value={totals?.promptTokens} />
        <StatTile label="Completion tokens" value={totals?.completionTokens} />
        <StatTile label="Total tokens" value={totals?.totalTokens} />
        <StatTile label="Total cost" value={totals?.totalCost} cost />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BreakdownTable
          title="By provider"
          rows={q.data?.aggregates.byProvider ?? []}
        />
        <BreakdownTable
          title="By model"
          rows={q.data?.aggregates.byModel ?? []}
        />
      </div>

      {q.data?.daily && q.data.daily.length > 0 && (
        <BreakdownTable
          title="By day"
          rows={q.data.daily.map((row) => ({ key: row.date, totals: row.totals }))}
          wide
        />
      )}

      {q.isError && (
        <GlassPanel variant="compact">
          <p className="kg-hint">Could not reach the embedded server.</p>
        </GlassPanel>
      )}
    </div>
  )
}

function rangeToFilters(range: '7d' | '30d' | '90d' | 'all'): {
  start?: string
  end?: string
} {
  if (range === 'all') return {}
  const today = new Date()
  const end = formatDate(today)
  const days = range === '7d' ? 6 : range === '30d' ? 29 : 89
  const startDate = new Date(today)
  startDate.setDate(today.getDate() - days)
  return {
    start: formatDate(startDate),
    end,
  }
}

function formatDate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function rangeLabel(range: '7d' | '30d' | '90d' | 'all'): string {
  switch (range) {
    case '7d':
      return 'Last 7 days'
    case '30d':
      return 'Last 30 days'
    case '90d':
      return 'Last 90 days'
    case 'all':
      return 'All time'
  }
}

function StatTile({ label, value, cost = false }: { label: string; value?: number; cost?: boolean }) {
  return (
    <GlassPanel variant="compact" className="stat-tile">
      <p className="stat-tile__label mono">{label}</p>
      <p className="metric-numeral stat-tile__value">
        {value === undefined
          ? '—'
          : cost
            ? `$${value.toFixed(2)}`
            : value.toLocaleString()}
      </p>
    </GlassPanel>
  )
}

function BreakdownTable({
  title,
  rows,
  wide = false,
}: {
  title: string
  rows: Array<{ key: string; totals: UsageTotals }>
  wide?: boolean
}) {
  return (
    <GlassPanel
      variant="body"
      className={cn('!px-6 !py-[18px]', wide && 'col-[1/-1]')}
    >
      <h2 className="font-sans text-xs tracking-[0.1em] uppercase text-text-muted m-0 mb-3">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="kg-hint">No data.</p>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="px-1 py-2 text-left font-mono text-[10px] tracking-[0.12em] uppercase text-text-dim border-b border-border-line font-bold">
                Key
              </th>
              <th className="px-1 py-2 text-right font-mono text-[10px] tracking-[0.12em] uppercase text-text-dim border-b border-border-line font-bold tabular-nums">
                Tokens
              </th>
              <th className="px-1 py-2 text-right font-mono text-[10px] tracking-[0.12em] uppercase text-text-dim border-b border-border-line font-bold tabular-nums">
                Cost
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-1 py-2 text-left text-teal-300 font-mono text-xs border-b border-border-subtle">
                  {r.key}
                </td>
                <td className="px-1 py-2 text-right text-text-primary border-b border-border-subtle metric-numeral tabular-nums font-mono">
                  {r.totals.totalTokens.toLocaleString()}
                </td>
                <td className="px-1 py-2 text-right text-text-primary border-b border-border-subtle metric-numeral tabular-nums font-mono">
                  ${r.totals.totalCost.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </GlassPanel>
  )
}
