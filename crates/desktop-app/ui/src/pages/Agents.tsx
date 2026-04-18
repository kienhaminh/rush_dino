import { useQuery } from '@tanstack/react-query'
import { Star, RefreshCw } from 'lucide-react'

import { listAgents, type AgentListItem } from '@/api/agents'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { PageTopbar } from '@/components/shell/PageTopbar'
import { SkeletonCard } from '@/components/Skeleton'

export default function Agents() {
  const q = useQuery({ queryKey: ['agents'], queryFn: listAgents })

  return (
    <div className="page--framed">
      <PageTopbar
        eyebrow="Pool"
        title="Agents"
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
        {q.isError && (
          <GlassPanel variant="compact">
            <p className="kg-hint">Could not reach the embedded server.</p>
          </GlassPanel>
        )}
        <div className="agent-grid">
          {q.isLoading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : q.data?.map((a) => <AgentCard key={a.id} agent={a} />)}
        </div>
      </div>
    </div>
  )
}

function AgentCard({ agent }: { agent: AgentListItem }) {
  return (
    <GlassPanel variant="body" className="agent-card">
      <div className="agent-card__head">
        <span className="agent-card__sigil">{agent.emoji || '•'}</span>
        {agent.isDefault && (
          <span className="agent-card__default">
            <Star size={11} strokeWidth={2} /> default
          </span>
        )}
      </div>
      <h3 className="agent-card__name">{agent.name}</h3>
      <p className="agent-card__workspace mono">{agent.workspace || '—'}</p>
      <p className="agent-card__description">
        {agent.description || <span className="kg-hint">no description</span>}
      </p>
      {agent.claimTags && agent.claimTags.length > 0 && (
        <div className="agent-card__tags">
          {agent.claimTags.slice(0, 4).map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </div>
      )}
    </GlassPanel>
  )
}
