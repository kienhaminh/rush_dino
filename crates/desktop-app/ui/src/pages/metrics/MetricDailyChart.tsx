import { useState } from 'react'
import type { CostDailyEntry } from './types'
import { formatTokens, formatCost, formatDayLabel } from './helpers'

export function MetricDailyChart({ data }: { data: CostDailyEntry[] }) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  if (data.length === 0) {
    return (
      <div className="flex flex-col gap-3.5 bg-bg-panel border border-border-strong rounded-lg p-5">
        <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-text-muted">Daily usage</div>
        <div className="text-[13px] text-text-dim py-3">No data for this period.</div>
      </div>
    )
  }

  const maxTokens = Math.max(...data.map(d => d.totalTokens), 1)
  const barMaxW = data.length > 30 ? 12 : data.length > 20 ? 18 : data.length > 14 ? 24 : 36

  return (
    <div className="flex flex-col gap-3.5 bg-bg-panel border border-border-strong rounded-lg p-5">
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-text-muted">Daily usage</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {/* Bar chart */}
        <div className="flex items-end gap-[3px] h-[120px] px-0.5">
          {data.map((d) => {
            const heightPct = (d.totalTokens / maxTokens) * 100
            const isSelected = selectedDay === d.date
            const label = data.length > 20
              ? d.date.slice(8).replace(/^0/, '')
              : formatDayLabel(d.date)

            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col items-center gap-1 cursor-pointer min-w-0 hover:opacity-85 transition-opacity duration-[120ms]"
                style={{ maxWidth: barMaxW }}
                onClick={() => setSelectedDay(prev => prev === d.date ? null : d.date)}
                title={`${d.date}\n${formatTokens(d.totalTokens)} tokens\n${formatCost(d.totalCost)}`}
              >
                {data.length <= 14 && (
                  <span className="font-mono text-[9px] text-text-dim whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-center">
                    {formatTokens(d.totalTokens)}
                  </span>
                )}
                <div
                  className="w-full rounded-t-[3px] min-h-[2px] transition-[background,height] duration-[180ms]"
                  style={{
                    height: `${heightPct}%`,
                    background: isSelected ? 'var(--ds-teal-400)' : 'var(--ds-teal-600)',
                  }}
                />
                <span className="font-mono text-[9px] text-text-dim whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-center">
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {selectedDay && (() => {
        const d = data.find(x => x.date === selectedDay)
        if (!d) return null
        return (
          <div className="flex items-center gap-4 flex-wrap px-3.5 py-2.5 bg-bg-card border border-teal-line rounded-md font-mono text-[12px] text-text-muted">
            <span className="text-teal-400 font-semibold">{formatDayLabel(selectedDay)}</span>
            <span>{formatTokens(d.totalTokens)} tokens</span>
            <span className="opacity-30">·</span>
            <span>{formatTokens(d.input)} in</span>
            <span>{formatTokens(d.output)} out</span>
            <span className="opacity-30">·</span>
            <span className="text-teal-400 font-semibold">{formatCost(d.totalCost)} total</span>
            <span>{formatCost(d.inputCost)} in</span>
            <span>{formatCost(d.outputCost)} out</span>
          </div>
        )
      })()}
    </div>
  )
}
