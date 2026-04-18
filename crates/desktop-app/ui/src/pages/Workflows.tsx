import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'

import { listWorkflows, type WorkflowSummary } from '@/api/workflows'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { PageTopbar } from '@/components/shell/PageTopbar'
import { cn } from '@/lib/cn'

export default function Workflows() {
  const q = useQuery({ queryKey: ['workflows'], queryFn: listWorkflows })

  return (
    <div className="page--framed">
      <PageTopbar
        eyebrow="Orchestration"
        title="Workflows"
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
        {q.isLoading && <p className="kg-hint shimmer">loading workflows…</p>}
        {q.data && q.data.length === 0 && (
          <GlassPanel variant="compact">
            <p className="kg-hint">No workflows defined yet.</p>
          </GlassPanel>
        )}

        <div className="workflow-grid">
          {q.data?.map((w) => <WorkflowCard key={w.id} workflow={w} />)}
        </div>
      </div>
    </div>
  )
}

function WorkflowCard({ workflow }: { workflow: WorkflowSummary }) {
  const status = (workflow.status ?? 'draft').toLowerCase()
  return (
    <GlassPanel variant="body" className="workflow-card">
      <div className="workflow-card__head">
        <span className={cn('workflow-card__dot', `workflow-card__dot--${status}`)} aria-hidden />
        <h3 className="workflow-card__name">{workflow.name}</h3>
        <span className="workflow-card__status mono">{status}</span>
      </div>
      {workflow.description && <p className="workflow-card__description">{workflow.description}</p>}
      <dl className="workflow-card__meta">
        <div>
          <dt className="mono">Steps</dt>
          <dd className="metric-numeral">{workflow.step_count ?? 0}</dd>
        </div>
        {workflow.updated_at && (
          <div>
            <dt className="mono">Updated</dt>
            <dd className="mono">{new Date(workflow.updated_at).toLocaleDateString()}</dd>
          </div>
        )}
      </dl>
    </GlassPanel>
  )
}
