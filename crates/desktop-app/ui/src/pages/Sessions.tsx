import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { listAgentSessions, type AgentSession } from '@/api/sessions'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { PageTopbar } from '@/components/shell/PageTopbar'
import { Skeleton } from '@/components/Skeleton'

// Row layout — 4-column grid (timestamp | title | meta | duration).
// `[&:not(:first-child)]` reproduces the legacy `.session-row + .session-row`
// top-border rule without needing a parent class. `group` lets the duration
// column animate in on hover. Hover wash flips per theme — light darkens,
// dark lightens.
const SESSION_ROW_CLASSES =
  'group grid grid-cols-[180px_1fr_auto_auto] items-baseline gap-4 px-4 py-3 rounded-md transition-colors duration-[140ms] ease-ease-cubic hover:bg-[rgba(15,23,42,0.04)] dark:hover:bg-[rgba(255,255,255,0.03)] [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border-line'

export default function Sessions() {
  const q = useQuery({ queryKey: ['agent-sessions'], queryFn: listAgentSessions })

  return (
    <div className="page--framed">
      <PageTopbar
        eyebrow="Timeline"
        title="Sessions"
        actions={
          <button
            type="button"
            className="btn btn--square"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            aria-label="Refresh"
          >
            <RefreshCw size={13} strokeWidth={1.7} />
          </button>
        }
      />
      <div className="page__body">
        <GlassPanel variant="body" className="px-1 py-1.5">
          {q.isError && <p className="kg-hint">Could not reach the embedded server.</p>}
          {!q.isLoading && q.data && q.data.length === 0 && (
            <p className="kg-hint">No sessions yet — start a chat to create one.</p>
          )}
          <ol className="list-none m-0 p-0">
            {q.isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className={SESSION_ROW_CLASSES}>
                    <Skeleton width={120} height={11} />
                    <Skeleton width="55%" height={12} />
                    <Skeleton width={70} height={11} />
                    <Skeleton width={42} height={12} />
                  </li>
                ))
              : q.data?.map((s) => <SessionRow key={s.id} session={s} />)}
          </ol>
        </GlassPanel>
      </div>
    </div>
  )
}

function SessionRow({ session }: { session: AgentSession }) {
  const created = session.created_at ? new Date(session.created_at) : null
  const duration = sessionDuration(session)
  return (
    <li className={SESSION_ROW_CLASSES}>
      <span className="font-mono text-[11px] text-text-dim">
        {created ? created.toLocaleString([], { hour12: false }) : '—'}
      </span>
      <span className="text-sm text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">
        {session.title || session.id.slice(0, 10)}
      </span>
      <span className="font-mono text-[11px] text-text-muted">
        {session.channel ?? 'chat'}
        {session.status ? ` · ${session.status}` : ''}
      </span>
      <span className="metric-numeral text-[13px] text-text-dim opacity-0 -translate-x-1 transition-[opacity,transform,color] duration-[180ms] ease-ease-cubic group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-teal-300">
        {duration ?? ''}
      </span>
    </li>
  )
}

function sessionDuration(s: AgentSession): string | null {
  if (!s.created_at) return null
  const start = new Date(s.created_at).getTime()
  const end = s.updated_at ? new Date(s.updated_at).getTime() : Date.now()
  const mins = Math.max(0, Math.round((end - start) / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m}m`
}
