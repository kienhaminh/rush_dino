import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Pause, Zap, RefreshCw } from 'lucide-react'

import { listCronJobs, pauseCronJob, resumeCronJob, runCronJobNow, type CronJob } from '@/api/cron'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { PageTopbar } from '@/components/shell/PageTopbar'
import { Skeleton } from '@/components/Skeleton'
import { cn } from '@/lib/cn'

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
                <div key={i} className="cron-row">
                  <div className="cron-row__head">
                    <Skeleton width={7} height={7} rounded />
                    <Skeleton width="35%" height={12} />
                    <Skeleton width={92} height={14} rounded />
                  </div>
                  <div className="cron-row__meta">
                    <Skeleton width={36} height={9} />
                    <Skeleton width={60} height={10} />
                    <Skeleton width={24} height={9} />
                    <Skeleton width={140} height={11} />
                  </div>
                  <div className="cron-row__actions">
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
    <div className="cron-row">
      <div className="cron-row__head">
        <span
          className={cn(
            'cron-row__dot',
            paused ? 'cron-row__dot--paused' : 'cron-row__dot--live',
          )}
        />
        <span className="cron-row__name">{job.name ?? job.id}</span>
        <span className="cron-row__schedule mono">{job.schedule ?? '—'}</span>
      </div>
      <div className="cron-row__meta">
        <span className="mono cron-row__label">agent</span>
        <span className="mono">{job.agent_id?.slice(0, 10) ?? '—'}</span>
        <span className="mono cron-row__label">next</span>
        <span className="metric-numeral cron-row__next">
          {job.next_run_at
            ? new Date(job.next_run_at).toLocaleString([], { hour12: false })
            : '—'}
        </span>
      </div>
      <div className="cron-row__actions">
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
