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

/* Width animation: collapsed -> 0 width, no border, no opacity.
   Open -> 300px, 1px border, full opacity. Same easing as before. */
const PANEL_BASE =
  'flex-shrink-0 overflow-hidden flex flex-col bg-bg-main ' +
  'transition-[width,opacity,border-width] duration-[240ms] ease-ease-cubic'
const PANEL_CLOSED = 'w-0 opacity-0 border-l-0 border-l border-border-line'
const PANEL_OPEN = 'w-[300px] opacity-100 border-l border-border-line'

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
    <div className={cn(PANEL_BASE, open ? PANEL_OPEN : PANEL_CLOSED)}>
      <div
        role="tablist"
        className="flex items-center gap-0.5 px-3 pt-2.5 border-b border-border-line"
      >
        <Tab active={tab === 'activity'} onClick={() => setTab('activity')}>
          Activity
        </Tab>
        <Tab active={tab === 'tasks'} onClick={() => setTab('tasks')}>
          Tasks
        </Tab>
      </div>

      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="font-sans text-xs font-medium text-text-muted">
          {running ? 'Running' : runs.data && runs.data.length > 0 ? 'Recent' : 'Idle'}
        </span>
        <span
          className={cn(
            'status-dot',
            running ? 'status-dot--warn status-dot--pulse' : 'status-dot--live',
          )}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 pt-2 flex flex-col gap-2">
        {tab === 'activity' &&
          (runs.isLoading ? (
            <ul className="list-none m-0 p-0 flex flex-col gap-2">
              <SkeletonAgentRun />
              <SkeletonAgentRun />
              <SkeletonAgentRun />
            </ul>
          ) : runs.data && runs.data.length > 0 ? (
            <ul className="list-none m-0 p-0 flex flex-col gap-2">
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

/* ── Tab ───────────────────────────────────────────────────────────── */
function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 border-none bg-transparent font-sans text-[13px] cursor-pointer',
        'border-b-2 -mb-px transition-[color,border-color] duration-[140ms] ease-ease-cubic',
        active
          ? 'text-text-primary font-medium border-text-primary'
          : 'text-text-muted border-transparent hover:text-text-primary',
      )}
    >
      {children}
    </button>
  )
}

/* ── Run row ───────────────────────────────────────────────────────── */
const RUN_BASE =
  'p-3 rounded-md flex flex-col gap-1 border bg-bg-card transition-[border-color] duration-[140ms] ease-ease-cubic'

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
    <li
      className={cn(
        RUN_BASE,
        active ? 'border-teal-line bg-teal-soft' : 'border-border-subtle',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <RunPill state={run.state} />
        <span className="font-mono text-[10px] text-text-dim tracking-[0.04em]">
          {formatWhen(ts)}
        </span>
      </div>
      {run.toolName && (
        <div className="font-mono text-[11px] text-teal-300 tracking-[0.02em]">
          {run.toolName}
        </div>
      )}
      {run.summary && (
        <p className="m-0 text-xs text-text-secondary leading-[1.45] line-clamp-2">
          {run.summary}
        </p>
      )}
      {run.error && (
        <p className="m-0 font-mono text-[11px] text-error bg-[rgb(248_113_113_/_0.08)] px-1.5 py-1 rounded break-words">
          {run.error}
        </p>
      )}
      {active && (
        <button
          type="button"
          onClick={onAbort}
          disabled={aborting}
          title="Cancel this run"
          className={cn(
            'self-end inline-flex items-center gap-[5px] px-2 py-[3px] rounded',
            'border border-border-strong bg-transparent text-text-muted',
            'font-sans text-[10px] uppercase tracking-[0.1em] cursor-pointer',
            'transition-[color,border-color] duration-[140ms] ease-ease-cubic',
            'hover:enabled:text-error hover:enabled:border-error',
            'disabled:opacity-50 disabled:cursor-default',
          )}
        >
          <StopCircle size={11} strokeWidth={1.8} />
          {aborting ? 'cancelling…' : 'cancel'}
        </button>
      )}
    </li>
  )
}

/* ── Run pill ──────────────────────────────────────────────────────── */
const PILL_BASE =
  'inline-flex items-center px-[7px] py-[2px] rounded-full font-mono text-[9px] font-bold tracking-[0.12em] uppercase'

function RunPill({ state }: { state: RunState }) {
  const variant = stateVariant(state)
  const variantCls =
    variant === 'running'
      ? 'text-teal-400 bg-teal-soft border border-teal-line'
      : variant === 'warn'
        ? 'text-warning bg-[rgb(245_193_24_/_0.1)] border border-[rgb(245_193_24_/_0.35)]'
        : variant === 'ok'
          ? 'text-success bg-[rgb(74_222_128_/_0.1)] border border-[rgb(74_222_128_/_0.35)]'
          : variant === 'error'
            ? 'text-error bg-[rgb(248_113_113_/_0.1)] border border-[rgb(248_113_113_/_0.35)]'
            : 'text-text-dim bg-bg-panel border border-border-strong'
  return <span className={cn(PILL_BASE, variantCls)}>{humanState(state)}</span>
}

/* ── Tasks pane ────────────────────────────────────────────────────── */
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
    <div className="flex flex-col gap-4">
      {skills.length > 0 && (
        <Group title="Skills" icon={<Sparkles size={12} strokeWidth={1.7} />}>
          <div className="flex flex-wrap gap-1">
            {skills.slice(0, 18).map((s) => (
              <Chip key={s.name} title={s.description ?? undefined}>
                {s.name}
              </Chip>
            ))}
            {skills.length > 18 && (
              <Chip muted>+{skills.length - 18}</Chip>
            )}
          </div>
        </Group>
      )}

      {cron.length > 0 && (
        <Group title="Scheduled" icon={<Clock size={12} strokeWidth={1.7} />}>
          <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
            {cron.map((job) => (
              <li
                key={job.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 px-2 py-1.5 rounded-sm bg-bg-card border border-border-subtle"
              >
                <span
                  className={cn(
                    'status-dot',
                    job.enabled === false || job.status === 'paused'
                      ? 'status-dot--idle'
                      : 'status-dot--live',
                  )}
                />
                <span className="font-sans text-xs text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">
                  {job.name ?? job.id}
                </span>
                <span className="font-mono text-[10px] text-teal-300 bg-teal-soft px-1.5 py-0.5 rounded tracking-[0.02em]">
                  {job.schedule ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </Group>
      )}

      {channels.length > 0 && (
        <Group title="Channels" icon={<Radio size={12} strokeWidth={1.7} />}>
          <div className="flex flex-wrap gap-1">
            {channels.map((ch, i) => (
              <Chip key={(ch.channelId ?? ch.id ?? i).toString()}>
                {(ch.channelId ?? ch.id ?? '—') as string}
              </Chip>
            ))}
          </div>
        </Group>
      )}

      {runtime.files && runtime.files.length > 0 && (
        <Group title="Files" icon={<FileText size={12} strokeWidth={1.7} />}>
          <ul className="list-none m-0 p-0 flex flex-col gap-0.5 font-mono text-[11px]">
            {runtime.files.slice(0, 8).map((f) => (
              <li
                key={f.path}
                className="flex justify-between gap-2.5 px-1 py-[3px] text-text-secondary"
              >
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{f.name}</span>
                <span className="text-text-dim flex-shrink-0">{f.size}</span>
              </li>
            ))}
          </ul>
        </Group>
      )}
    </div>
  )
}

function Chip({
  children,
  muted,
  title,
}: {
  children: React.ReactNode
  muted?: boolean
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center px-2 py-[3px] rounded-full bg-bg-card border border-border-subtle',
        'font-mono text-[10px] tracking-[0.02em]',
        muted ? 'text-text-dim' : 'text-text-secondary',
      )}
    >
      {children}
    </span>
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
    <div className="flex flex-col gap-2">
      <h3 className="m-0 inline-flex items-center gap-1.5 font-sans text-[10px] font-bold tracking-[0.16em] uppercase text-text-dim">
        {icon} {title}
      </h3>
      {children}
    </div>
  )
}

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 px-4 py-10">
      <p className="m-0 text-[13px] font-medium text-text-primary">{title}</p>
      <p className="m-0 text-xs text-text-dim leading-[1.5]">{sub}</p>
    </div>
  )
}

/* ── helpers ───────────────────────────────────────────────────────── */
type PillVariant = 'running' | 'warn' | 'ok' | 'error' | 'muted'

function stateVariant(state: RunState): PillVariant {
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
