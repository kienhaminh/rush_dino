import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'

import { listWorkflows, type WorkflowSummary } from '@/api/workflows'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { PageTopbar } from '@/components/shell/PageTopbar'
import { cn } from '@/lib/cn'

/* Status dot color by workflow state. Defaults to neutral text-dim. */
const DOT_CLASS: Record<string, string> = {
  active:  'bg-success shadow-[0_0_8px_rgba(74,222,128,0.5)]',
  running: 'bg-success shadow-[0_0_8px_rgba(74,222,128,0.5)]',
  paused:  'bg-warning',
  failed:  'bg-error',
}

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

        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
          {q.data?.map((w) => <WorkflowCard key={w.id} workflow={w} />)}
        </div>
      </div>
    </div>
  )
}

function WorkflowCard({ workflow }: { workflow: WorkflowSummary }) {
  const status = (workflow.status ?? 'draft').toLowerCase()
  return (
    <GlassPanel
      variant="body"
      className="!flex !flex-col !gap-2.5 !p-[18px_20px]"
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex flex-1 items-center gap-2.5 min-w-0">
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full bg-text-dim',
              DOT_CLASS[status],
            )}
            aria-hidden
          />
          <h3 className="m-0 flex-1 truncate text-[16px] font-semibold text-text-primary">
            {workflow.name}
          </h3>
        </div>
        <span className="mono shrink-0 rounded-full border border-border-strong px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
          {status}
        </span>
      </div>
      {workflow.description && (
        <p className="m-0 line-clamp-2 text-[13px] leading-[1.5] text-text-muted">
          {workflow.description}
        </p>
      )}
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-3">
        <div className="flex justify-between gap-2.5">
          <dt className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-dim">
            Steps
          </dt>
          <dd className="metric-numeral m-0 text-[12px] text-text-primary">
            {workflow.step_count ?? 0}
          </dd>
        </div>
        {workflow.updated_at && (
          <div className="flex justify-between gap-2.5">
            <dt className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-dim">
              Updated
            </dt>
            <dd className="mono m-0 text-[12px] text-text-primary">
              {new Date(workflow.updated_at).toLocaleDateString()}
            </dd>
          </div>
        )}
      </dl>
    </GlassPanel>
  )
}
