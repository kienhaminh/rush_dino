import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Pause, Zap, RefreshCw } from 'lucide-react'

import { listCronJobs, pauseCronJob, resumeCronJob, runCronJobNow, type CronJob } from '@/api/cron'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { PageTopbar } from '@/components/shell/PageTopbar'
import { Skeleton } from '@/components/Skeleton'
import { cn } from '@/lib/cn'

// Shared row layout used for both skeleton loaders and live rows.
// `[&:not(:first-child)]` reproduces the legacy `.cron-row + .cron-row` rule
// (top border on every row except the first) without needing a parent class.
// Hover wash flips per theme — light mode darkens, dark mode lightens.
const CRON_ROW_CLASSES =
  'grid grid-cols-[1fr_auto_auto] items-center gap-3.5 rounded-md px-4 py-3.5 transition-colors hover:bg-[rgba(15,23,42,0.04)] dark:hover:bg-[rgba(255,255,255,0.03)] [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border-line'

export default function Cron() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['cron'], queryFn: listCronJobs })

  const pause = useMutation({
    mutationFn: pauseCronJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cron'] }),
  })
  const resume = useMutation({
    mutationFn: resumeCronJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cron'] }),
  })
  const runNow = useMutation({ mutationFn: runCronJobNow })

  return (
    <div className="page--framed">
      <PageTopbar
        eyebrow="Schedule"
        title="Cron"
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
        {!q.isLoading && q.data && q.data.length === 0 && (
          <GlassPanel variant="compact">
            <p className="kg-hint">No cron jobs scheduled.</p>
          </GlassPanel>
        )}

        <GlassPanel variant="body" className="cron-list">
          {q.isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={CRON_ROW_CLASSES}>
                  <div className="col-span-full flex items-center gap-3">
                    <Skeleton width={7} height={7} rounded />
                    <Skeleton width="35%" height={12} />
                    <Skeleton width={92} height={14} rounded />
                  </div>
                  <div className="col-span-2 flex items-center gap-2.5 font-mono text-[11px] text-text-muted">
                    <Skeleton width={36} height={9} />
                    <Skeleton width={60} height={10} />
                    <Skeleton width={24} height={9} />
                    <Skeleton width={140} height={11} />
                  </div>
                  <div className="col-start-3 row-span-2 row-start-1 flex gap-1.5 self-center">
                    <Skeleton width={56} height={22} rounded />
                    <Skeleton width={72} height={22} rounded />
                  </div>
                </div>
              ))
            : q.data?.map((job) => (
                <CronRow
                  key={job.id}
                  job={job}
                  onPause={() => pause.mutate(job.id)}
                  onResume={() => resume.mutate(job.id)}
                  onRun={() => runNow.mutate(job.id)}
                />
              ))}
        </GlassPanel>
      </div>
    </div>
  )
}

function CronRow({
  job,
  onPause,
  onResume,
  onRun,
}: {
  job: CronJob
  onPause: () => void
  onResume: () => void
  onRun: () => void
}) {
  const paused = job.status === 'paused' || job.enabled === false
  return (
    <div className={CRON_ROW_CLASSES}>
      <div className="col-span-full flex items-center gap-3">
        <span
          className={cn(
            'h-[7px] w-[7px] shrink-0 rounded-full',
            paused
              ? 'bg-text-dim'
              : 'bg-success shadow-[0_0_8px_rgba(74,222,128,0.6)]',
          )}
        />
        <span className="text-sm font-medium text-text-primary">
          {job.name ?? job.id}
        </span>
        <span className="rounded-[4px] bg-teal-soft px-2 py-[3px] font-mono text-[11px] text-teal-300">
          {job.schedule ?? '—'}
        </span>
      </div>
      <div className="col-span-2 flex items-center gap-2.5 font-mono text-[11px] text-text-muted">
        <span className="text-[9px] uppercase tracking-[0.1em] text-text-dim">agent</span>
        <span className="mono">{job.agent_id?.slice(0, 10) ?? '—'}</span>
        <span className="text-[9px] uppercase tracking-[0.1em] text-text-dim">next</span>
        <span className="metric-numeral font-mono text-xs text-text-primary">
          {job.next_run_at
            ? new Date(job.next_run_at).toLocaleString([], { hour12: false })
            : '—'}
        </span>
      </div>
      <div className="col-start-3 row-span-2 row-start-1 flex gap-1.5 self-center">
        {paused ? (
          <button type="button" className="btn" onClick={onResume}>
            <Play size={11} strokeWidth={1.8} /> resume
          </button>
        ) : (
          <button type="button" className="btn" onClick={onPause}>
            <Pause size={11} strokeWidth={1.8} /> pause
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={onRun}>
          <Zap size={11} strokeWidth={1.8} /> run now
        </button>
      </div>
    </div>
  )
}
