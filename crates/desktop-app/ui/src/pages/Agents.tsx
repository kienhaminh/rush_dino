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
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
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
    <GlassPanel variant="body" className="!p-[20px_22px] flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[26px] leading-none">{agent.emoji || '•'}</span>
        {agent.isDefault && (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] uppercase text-teal-300">
            <Star size={11} strokeWidth={2} /> default
          </span>
        )}
      </div>
      <h3 className="text-base font-medium text-text-primary mt-0.5 mb-0">{agent.name}</h3>
      <p className="font-mono text-[11px] text-text-dim m-0">{agent.workspace || '—'}</p>
      <p className="text-[13px] text-text-muted leading-[1.5] mt-1 mb-0 line-clamp-3">
        {agent.description || <span className="kg-hint">no description</span>}
      </p>
      {agent.claimTags && agent.claimTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {agent.claimTags.slice(0, 4).map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </div>
      )}
    </GlassPanel>
  )
}
