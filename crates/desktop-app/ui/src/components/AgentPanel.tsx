import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Sparkles, Clock, StopCircle, Radio, FileText } from 'lucide-react'

import {
  abortRun,
  getAgentRuntime,
  listSessionRuns,
  type AgentRuntimeResponse,
  type RunSummary,
  type RunState,
} from '@/api/agent-runtime'
import { SkeletonAgentRun, SkeletonText } from '@/components/Skeleton'
import { cn } from '@/lib/cn'

type Props = {
  agentId?: string
  conversationId: string | null
  /** Label shown when no agent is selected (falls back to "RushDino"). */
  label?: string
  running: boolean
  open: boolean
}

export function AgentPanel({ agentId, conversationId, label, running, open }: Props) {
  const [tab, setTab] = useState<'activity' | 'tasks'>('activity')

  const runtime = useQuery<AgentRuntimeResponse>({
    queryKey: ['agent-runtime', agentId],
    queryFn: () => getAgentRuntime(agentId!),
    enabled: Boolean(agentId),
    staleTime: 15_000,
  })

  const runs = useQuery<RunSummary[]>({
    queryKey: ['session-runs', conversationId],
    queryFn: () => listSessionRuns(conversationId!, 12),
    enabled: Boolean(conversationId),
    refetchInterval: running ? 2000 : 8000,
  })

  const abort = useMutation({ mutationFn: abortRun })

  return (
    <div className={cn('agent-panel', open && 'agent-panel--open')}>
      <div className="agent-panel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'activity'}
          className={cn('agent-panel__tab', tab === 'activity' && 'agent-panel__tab--active')}
          onClick={() => setTab('activity')}
        >
          Activity
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tasks'}
          className={cn('agent-panel__tab', tab === 'tasks' && 'agent-panel__tab--active')}
          onClick={() => setTab('tasks')}
        >
          Tasks
        </button>
      </div>

      <div className="agent-panel__section-head">
        <span className="agent-panel__section-label">
          {running ? 'Running' : runs.data && runs.data.length > 0 ? 'Recent' : 'Idle'}
        </span>
        <span
          className={cn(
            'status-dot',
            running ? 'status-dot--warn status-dot--pulse' : 'status-dot--live',
          )}
        />
      </div>

      <div className="agent-panel__body">
        {tab === 'activity' &&
          (runs.isLoading ? (
            <ul className="agent-panel__runs">
              <SkeletonAgentRun />
              <SkeletonAgentRun />
              <SkeletonAgentRun />
            </ul>
          ) : runs.data && runs.data.length > 0 ? (
            <ul className="agent-panel__runs">
              {runs.data.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  onAbort={() => abort.mutate(run.id)}
                  aborting={abort.isPending && abort.variables === run.id}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              title={running ? `${label ?? 'Agent'} is working…` : 'No runs yet'}
              sub={
                running
                  ? 'Tool output and run state will appear here as the agent streams.'
                  : 'Start a chat to create a run.'
              }
            />
          ))}

        {tab === 'tasks' &&
          (!agentId ? (
            <EmptyState
              title="No agent selected"
              sub="Pick an agent from the sidebar to see its skills and scheduled jobs."
            />
          ) : runtime.isLoading ? (
            <SkeletonText lines={4} />
          ) : runtime.data ? (
            <TasksContent runtime={runtime.data} />
          ) : (
            <EmptyState
              title="Couldn't load runtime"
              sub="The agent's configuration couldn't be fetched. Try switching agents."
            />
          ))}
      </div>
    </div>
  )
}

function RunRow({
  run,
  onAbort,
  aborting,
}: {
  run: RunSummary
  onAbort: () => void
  aborting: boolean
}) {
  const active = run.state === 'Running' || run.state === 'AwaitingApproval' || run.state === 'AwaitingInput'
  const ts = run.completedAt || run.updatedAt || run.startedAt || run.createdAt
  return (
    <li className={cn('agent-panel__run', active && 'agent-panel__run--active')}>
      <div className="agent-panel__run-head">
        <span className={cn('run-pill', `run-pill--${stateClass(run.state)}`)}>
          {humanState(run.state)}
        </span>
        <span className="agent-panel__run-time mono">{formatWhen(ts)}</span>
      </div>
      {run.toolName && (
        <div className="agent-panel__run-tool mono">{run.toolName}</div>
      )}
      {run.summary && (
        <p className="agent-panel__run-summary">{run.summary}</p>
      )}
      {run.error && <p className="agent-panel__run-error">{run.error}</p>}
      {active && (
        <button
          type="button"
          className="agent-panel__run-abort"
          onClick={onAbort}
          disabled={aborting}
          title="Cancel this run"
        >
          <StopCircle size={11} strokeWidth={1.8} />
          {aborting ? 'cancelling…' : 'cancel'}
        </button>
      )}
    </li>
  )
}

function TasksContent({ runtime }: { runtime: AgentRuntimeResponse }) {
  const skills = runtime.skills ?? []
  const cron = runtime.cronJobs ?? []
  const channels = runtime.channels ?? []

  if (skills.length === 0 && cron.length === 0 && channels.length === 0) {
    return (
      <EmptyState
        title="Nothing scheduled"
        sub="This agent has no skills, cron jobs, or channels attached."
      />
    )
  }

  return (
    <div className="agent-panel__tasks">
      {skills.length > 0 && (
        <Group title="Skills" icon={<Sparkles size={12} strokeWidth={1.7} />}>
          <div className="agent-panel__chips">
            {skills.slice(0, 18).map((s) => (
              <span key={s.name} className="agent-panel__chip" title={s.description ?? undefined}>
                {s.name}
              </span>
            ))}
            {skills.length > 18 && (
              <span className="agent-panel__chip agent-panel__chip--muted">
                +{skills.length - 18}
              </span>
            )}
          </div>
        </Group>
      )}

      {cron.length > 0 && (
        <Group title="Scheduled" icon={<Clock size={12} strokeWidth={1.7} />}>
          <ul className="agent-panel__cron">
            {cron.map((job) => (
              <li key={job.id} className="agent-panel__cron-row">
                <span
                  className={cn(
                    'status-dot',
                    job.enabled === false || job.status === 'paused'
                      ? 'status-dot--idle'
                      : 'status-dot--live',
                  )}
                />
                <span className="agent-panel__cron-name">{job.name ?? job.id}</span>
                <span className="agent-panel__cron-schedule mono">
                  {job.schedule ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </Group>
      )}

      {channels.length > 0 && (
        <Group title="Channels" icon={<Radio size={12} strokeWidth={1.7} />}>
          <div className="agent-panel__chips">
            {channels.map((ch, i) => (
              <span key={(ch.channelId ?? ch.id ?? i).toString()} className="agent-panel__chip">
                {(ch.channelId ?? ch.id ?? '—') as string}
              </span>
            ))}
          </div>
        </Group>
      )}

      {runtime.files && runtime.files.length > 0 && (
        <Group title="Files" icon={<FileText size={12} strokeWidth={1.7} />}>
          <ul className="agent-panel__files mono">
            {runtime.files.slice(0, 8).map((f) => (
              <li key={f.path}>
                <span className="agent-panel__file-name">{f.name}</span>
                <span className="agent-panel__file-size">{f.size}</span>
              </li>
            ))}
          </ul>
        </Group>
      )}
    </div>
  )
}

function Group({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="agent-panel__group">
      <h3 className="agent-panel__group-title">
        {icon} {title}
      </h3>
      {children}
    </div>
  )
}

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="agent-panel__empty-state">
      <p className="agent-panel__empty-title">{title}</p>
      <p className="agent-panel__empty-sub">{sub}</p>
    </div>
  )
}

function stateClass(state: RunState): string {
  switch (state) {
    case 'Running':
      return 'running'
    case 'AwaitingApproval':
    case 'AwaitingInput':
      return 'warn'
    case 'Completed':
      return 'ok'
    case 'Failed':
      return 'error'
    case 'Cancelled':
      return 'muted'
    default:
      return 'muted'
  }
}

function humanState(state: RunState): string {
  switch (state) {
    case 'Running':
      return 'running'
    case 'AwaitingApproval':
      return 'awaiting approval'
    case 'AwaitingInput':
      return 'awaiting input'
    case 'Completed':
      return 'done'
    case 'Failed':
      return 'failed'
    case 'Cancelled':
      return 'cancelled'
    default:
      return String(state).toLowerCase()
  }
}

function formatWhen(ts?: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
