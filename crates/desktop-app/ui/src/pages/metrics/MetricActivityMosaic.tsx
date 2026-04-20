import type { SessionUsageEntry } from './types'
import { buildMosaicStats } from './helpers'
import { formatTokens } from './helpers'

const HOUR_LABELS = ['12am', '4am', '8am', '12pm', '4pm', '8pm']

export function MetricActivityMosaic({ sessions }: { sessions: SessionUsageEntry[] }) {
  const stats = buildMosaicStats(sessions)

  const maxHour    = Math.max(...stats.hourTotals, 1)
  const maxWeekday = Math.max(...stats.weekdayTotals.map(d => d.tokens), 1)

  return (
    <div className="flex flex-col gap-3.5 bg-bg-panel border border-border-strong rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-text-muted">Activity by Time</span>
        {stats.hasData && (
          <span className="ml-auto font-mono text-[10px] text-text-dim">{formatTokens(stats.totalTokens)} tokens</span>
        )}
      </div>

      {!stats.hasData ? (
        <div className="text-[13px] text-text-dim py-3">No timeline data in this range.</div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: '1fr' }}>
          {/* Day of week */}
          <div className="flex flex-col gap-2.5">
            <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-text-dim">Day of Week</div>
            <div className="flex gap-1">
              {stats.weekdayTotals.map(({ label, tokens }) => {
                const intensity = Math.min(tokens / maxWeekday, 1)
                const opacity   = tokens > 0 ? 0.12 + intensity * 0.7 : 0
                return (
                  <div
                    key={label}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${label}: ${formatTokens(tokens)}`}
                  >
                    <div
                      className="w-full h-10 rounded border transition-[background] duration-200"
                      style={{
                        background:   opacity > 0 ? `rgba(45, 212, 191, ${opacity})` : 'transparent',
                        borderColor:  opacity > 0 ? `rgba(45, 212, 191, 0.3)` : 'rgba(255,255,255,0.05)',
                      }}
                    />
                    <span className="font-mono text-[9px] text-text-dim">{label}</span>
                    <span className="font-mono text-[9px] text-text-dim tabular-nums">{formatTokens(tokens)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Hour of day */}
          <div className="flex flex-col gap-2.5">
            <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-text-dim">Hour of Day</div>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
              {stats.hourTotals.map((value, hour) => {
                const intensity     = Math.min(value / maxHour, 1)
                const opacity       = value > 0 ? 0.08 + intensity * 0.7 : 0
                const borderOpacity = intensity > 0.7 ? 0.6 : 0.2
                return (
                  <div
                    key={hour}
                    className="h-[22px] rounded-[3px] border transition-[background] duration-200"
                    style={{
                      background:  opacity > 0 ? `rgba(45, 212, 191, ${opacity})` : 'rgba(255,255,255,0.03)',
                      borderColor: `rgba(45, 212, 191, ${borderOpacity})`,
                    }}
                    title={`${hour}:00–${hour + 1}:00\n${formatTokens(value)} tokens`}
                  />
                )
              })}
            </div>
            <div className="flex justify-between font-mono text-[9px] text-text-dim">
              {HOUR_LABELS.map(l => <span key={l}>{l}</span>)}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-1 font-mono text-[9px] text-text-dim">
              <div
                className="w-3 h-3 rounded-[3px] border flex-shrink-0"
                style={{ background: 'rgba(45,212,191,0.08)', borderColor: 'rgba(45,212,191,0.2)' }}
              />
              <span>Low</span>
              <div
                className="w-3 h-3 rounded-[3px] border flex-shrink-0 ml-1.5"
                style={{ background: 'rgba(45,212,191,0.78)', borderColor: 'rgba(45,212,191,0.6)' }}
              />
              <span>High density</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
