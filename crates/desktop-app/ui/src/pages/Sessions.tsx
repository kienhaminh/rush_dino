import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { listAgentSessions, type AgentSession } from '@/api/sessions'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { PageTopbar } from '@/components/shell/PageTopbar'
import { Skeleton } from '@/components/Skeleton'

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
        <GlassPanel variant="body" className="sessions-list">
          {q.isError && <p className="kg-hint">Could not reach the embedded server.</p>}
          {!q.isLoading && q.data && q.data.length === 0 && (
            <p className="kg-hint">No sessions yet — start a chat to create one.</p>
          )}
          <ol className="session-items">
            {q.isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="session-row">
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
    <li className="session-row">
      <span className="session-row__time mono">
        {created ? created.toLocaleString([], { hour12: false }) : '—'}
      </span>
      <span className="session-row__title">
        {session.title || session.id.slice(0, 10)}
      </span>
      <span className="session-row__meta mono">
        {session.channel ?? 'chat'}
        {session.status ? ` · ${session.status}` : ''}
      </span>
      <span className="session-row__duration metric-numeral">{duration ?? ''}</span>
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
