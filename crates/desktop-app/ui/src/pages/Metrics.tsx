import { useQuery } from '@tanstack/react-query'

import { getUsageMetrics, type UsageTotals } from '@/api/metrics'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'

export default function Metrics() {
  const q = useQuery({ queryKey: ['metrics'], queryFn: getUsageMetrics })
  const totals = q.data?.totals

  return (
    <div className="settings-page">
      <SettingsPageHeader
        title="Metrics"
        lede="Tokens and cost rendered in tabular serif numerals — a ledger, not a dashboard. Breakdowns by provider, model, and day sit below."
      />

      <div className="metrics-totals">
        <StatTile label="Prompt tokens" value={totals?.promptTokens} />
        <StatTile label="Completion tokens" value={totals?.completionTokens} />
        <StatTile label="Total tokens" value={totals?.totalTokens} />
        <StatTile label="Total cost" value={totals?.totalCost} cost />
      </div>

      <div className="metrics-grid">
        <BreakdownTable
          title="By provider"
          rows={q.data?.byProvider ?? []}
        />
        <BreakdownTable
          title="By model"
          rows={q.data?.byModel ?? []}
        />
      </div>

      {q.data?.byDay && q.data.byDay.length > 0 && (
        <BreakdownTable title="By day" rows={q.data.byDay} wide />
      )}

      {q.isError && (
        <GlassPanel variant="compact">
          <p className="kg-hint">Could not reach the embedded server.</p>
        </GlassPanel>
      )}
    </div>
  )
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
