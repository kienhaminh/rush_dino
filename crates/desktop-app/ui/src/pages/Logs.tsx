import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Pause, Play } from 'lucide-react'

import { getLogs, type LogLevel, type RuntimeLogView } from '@/api/logs'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { PageTopbar } from '@/components/shell/PageTopbar'
import { Skeleton } from '@/components/Skeleton'
import { cn } from '@/lib/cn'

const LEVELS: Array<{ value: LogLevel | 'all'; label: string }> = [
  { value: 'all', label: 'all' },
  { value: 'error', label: 'error' },
  { value: 'warn', label: 'warn' },
  { value: 'info', label: 'info' },
  { value: 'debug', label: 'debug' },
]

// Shared log-row layout for both skeleton and live rows. Mirrors the legacy
// `.log-line` BEM rule (grid 92/56/180/1fr, mono, dimmed text, theme-aware
// hover wash).
const LOG_ROW_CLASSES =
  'grid grid-cols-[92px_56px_180px_1fr] gap-3 whitespace-nowrap py-0.5 text-text-muted hover:bg-[rgba(15,23,42,0.04)] dark:hover:bg-[rgba(255,255,255,0.03)]'

const LEVEL_COLORS: Record<LogLevel, string> = {
  error: 'text-error',
  warn: 'text-warning',
  info: 'text-success',
  debug: 'text-text-dim',
}

export default function Logs() {
  const [level, setLevel] = useState<LogLevel | 'all'>('all')
  const [search, setSearch] = useState('')
  const [paused, setPaused] = useState(false)

  const q = useQuery({
    queryKey: ['logs', level, search],
    queryFn: () =>
      getLogs({
        level: level === 'all' ? undefined : level,
        q: search || undefined,
        limit: 200,
      }),
    refetchInterval: paused ? false : 2000,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    if (paused) return
    const el = document.getElementById('log-stream')
    if (el) el.scrollTop = el.scrollHeight
  }, [q.data, paused])

  return (
    <div className="page--framed">
      <PageTopbar
        eyebrow="Observability"
        title="Logs"
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => setPaused((p) => !p)}
              title={paused ? 'Resume live tail' : 'Pause live tail'}
            >
              {paused ? <Play size={12} strokeWidth={1.8} /> : <Pause size={12} strokeWidth={1.8} />}
              {paused ? 'resume' : 'pause'}
            </button>
            <button
              type="button"
              className="btn btn--square"
              onClick={() => q.refetch()}
              disabled={q.isFetching}
              aria-label="Refresh"
            >
              <RefreshCw size={13} strokeWidth={1.7} />
            </button>
          </>
        }
      />
      <div className="page__body">
        <GlassPanel variant="compact" className="logs-toolbar">
          <div className="logs-toolbar__levels">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                type="button"
                className={cn('chip', level === l.value && 'chip--active')}
                onClick={() => setLevel(l.value)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="logs-toolbar__search mono"
            placeholder="filter substring…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </GlassPanel>

        <div id="log-stream" className="log-stream">
          {q.isLoading &&
            Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className={LOG_ROW_CLASSES}>
                <Skeleton width={92} height={11} />
                <Skeleton width={56} height={11} />
                <Skeleton width={180} height={11} />
                <Skeleton width={`${55 + ((i * 7) % 35)}%`} height={11} />
              </div>
            ))}
          {q.data?.items.length === 0 && <p className="kg-hint">No logs match.</p>}
          {q.data?.items.map((row) => <LogLine key={row.id} row={row} />)}
        </div>
      </div>
    </div>
  )
}

function LogLine({ row }: { row: RuntimeLogView }) {
  const ts = new Date(row.createdAt)
  return (
    <div className={LOG_ROW_CLASSES}>
      <span className="font-mono text-text-dim">
        {ts.toLocaleTimeString([], { hour12: false })}
        <span className="opacity-[0.55]">
          .{ts.getMilliseconds().toString().padStart(3, '0')}
        </span>
      </span>
      <span
        className={cn(
          'font-mono font-bold tracking-[0.04em]',
          LEVEL_COLORS[row.level],
        )}
      >
        {row.level.toUpperCase().padEnd(5)}
      </span>
      <span className="overflow-hidden text-ellipsis font-mono text-text-dim">
        {row.target}
      </span>
      <span className="whitespace-pre-wrap break-words text-text-primary">
        {row.message}
      </span>
    </div>
  )
}
