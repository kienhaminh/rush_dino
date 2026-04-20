import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getUsageMetrics, type UsageTotals } from '@/api/metrics'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'

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

      <div className="metrics-toolbar">
        <div className="metrics-range">
          {(['7d', '30d', '90d', 'all'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`metrics-range__chip ${item === range ? 'metrics-range__chip--active' : ''}`}
              onClick={() => setRange(item)}
            >
              {rangeLabel(item)}
            </button>
          ))}
        </div>
        <span className="metrics-toolbar__meta mono">
          {filters.start && filters.end ? `${filters.start} → ${filters.end}` : 'All recorded usage'}
        </span>
      </div>

      <div className="metrics-totals">
        <StatTile label="Prompt tokens" value={totals?.promptTokens} />
        <StatTile label="Completion tokens" value={totals?.completionTokens} />
        <StatTile label="Total tokens" value={totals?.totalTokens} />
        <StatTile label="Total cost" value={totals?.totalCost} cost />
      </div>

      <div className="metrics-grid">
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
  return value.toISOString().slice(0, 10)
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
    <GlassPanel variant="body" className={wide ? 'breakdown breakdown--wide' : 'breakdown'}>
      <h2 className="breakdown__title">{title}</h2>
      {rows.length === 0 ? (
        <p className="kg-hint">No data.</p>
      ) : (
        <table className="breakdown__table">
          <thead>
            <tr>
              <th>Key</th>
              <th className="num">Tokens</th>
              <th className="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="mono breakdown__key">{r.key}</td>
                <td className="num metric-numeral">{r.totals.totalTokens.toLocaleString()}</td>
                <td className="num metric-numeral">${r.totals.totalCost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </GlassPanel>
  )
}
