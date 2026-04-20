import { useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { SessionUsageEntry } from './types'
import { formatTokens, formatCost } from './helpers'

type SortBy = 'cost' | 'tokens' | 'recent'

function sessionLabel(s: SessionUsageEntry): string {
  const raw = s.label ?? s.key
  if (raw.startsWith('agent:') && raw.includes('?token=')) {
    return raw.slice(0, raw.indexOf('?token='))
  }
  return raw
}

export function MetricSessionsList({ sessions }: { sessions: SessionUsageEntry[] }) {
  const [sort, setSort] = useState<SortBy>('cost')
  const [asc, setAsc]   = useState(false)

  const sorted = [...sessions].sort((a, b) => {
    let diff = 0
    if (sort === 'recent') {
      diff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    } else if (sort === 'tokens') {
      diff = (b.usage?.totalTokens ?? 0) - (a.usage?.totalTokens ?? 0)
    } else {
      diff = (b.usage?.totalCost ?? 0) - (a.usage?.totalCost ?? 0)
    }
    return asc ? -diff : diff
  })

  const totalTokens = sorted.reduce((s, e) => s + (e.usage?.totalTokens ?? 0), 0)
  const totalCost   = sorted.reduce((s, e) => s + (e.usage?.totalCost   ?? 0), 0)

  return (
    <div className="flex flex-col gap-3.5 bg-bg-panel border border-border-strong rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-text-muted">Sessions</span>
        {/* Count */}
        <span className="font-mono text-[10px] text-text-dim ml-auto">{sessions.length} sessions</span>
        {/* Controls */}
        <div className="flex items-center gap-1.5">
          <select
            className="bg-bg-elevated border border-border-strong rounded-md px-2 py-[3px] font-mono text-[11px] text-text-muted outline-none cursor-pointer appearance-none"
            value={sort}
            onChange={e => setSort(e.target.value as SortBy)}
          >
            <option value="cost">By cost</option>
            <option value="tokens">By tokens</option>
            <option value="recent">Recent</option>
          </select>
          <button
            className="inline-flex items-center justify-center w-[22px] h-[22px] border border-border-strong rounded-md bg-bg-elevated text-text-muted cursor-pointer hover:text-text-primary hover:border-teal-line transition-colors"
            onClick={() => setAsc(a => !a)}
            title={asc ? 'Ascending' : 'Descending'}
          >
            {asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="font-mono text-[10px] text-text-dim flex items-center gap-1.5 px-0.5">
        <span>{formatTokens(totalTokens)} tokens total</span>
        <span className="opacity-40">·</span>
        <span>{formatCost(totalCost)} total</span>
      </div>

      {/* List */}
      <div className="flex flex-col border border-border-line rounded-md overflow-hidden">
        {sorted.length === 0 && (
          <div className="text-[13px] text-text-dim py-3 px-3">No sessions in range.</div>
        )}
        {sorted.slice(0, 60).map(s => {
          const tokens = s.usage?.totalTokens ?? 0
          const cost   = s.usage?.totalCost   ?? 0
          const label  = sessionLabel(s)
          return (
            <div
              key={s.key}
              className="grid border-b border-border-line last:border-b-0 px-3 py-2 hover:bg-white/[0.03] transition-colors duration-[120ms]"
              style={{ gridTemplateColumns: '1fr auto auto', gridTemplateRows: 'auto auto', columnGap: 10, rowGap: 2 }}
              title={s.key}
            >
              <span className="font-mono text-[12px] text-text-primary overflow-hidden text-ellipsis whitespace-nowrap" style={{ gridColumn: 1, gridRow: 1 }}>{label}</span>
              <span className="font-mono text-[12px] text-text-muted tabular-nums text-right" style={{ gridColumn: 2, gridRow: 1 }}>{formatTokens(tokens)}</span>
              <span className="font-mono text-[12px] text-teal-400 tabular-nums text-right" style={{ gridColumn: 3, gridRow: 1 }}>{formatCost(cost)}</span>
              {s.model && (
                <span className="font-mono text-[10px] text-text-dim overflow-hidden text-ellipsis whitespace-nowrap" style={{ gridColumn: '1 / -1', gridRow: 2 }}>{s.model}</span>
              )}
            </div>
          )
        })}
        {sorted.length > 60 && (
          <div className="px-3 py-2 text-[11px] text-text-dim text-center">+{sorted.length - 60} more</div>
        )}
      </div>
    </div>
  )
}
