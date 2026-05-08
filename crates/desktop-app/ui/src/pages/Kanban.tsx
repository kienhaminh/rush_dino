import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  Users,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Inbox,
  ClipboardList,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

import {
  deleteTask,
  getBoard,
  type KanbanTask,
  type TaskPriority,
  type TaskStatus,
} from '@/api/kanban'
import { PageTopbar } from '@/components/shell/PageTopbar'
import { Skeleton, SkeletonKanbanCard } from '@/components/Skeleton'
import { cn } from '@/lib/cn'

type Accent = 'neutral' | 'teal' | 'warn' | 'error' | 'ok'

type ColumnDef = {
  key: keyof import('@/api/kanban').KanbanBoardColumns
  status: TaskStatus
  label: string
  hint: string
  Icon: LucideIcon
  accent: Accent
}

const COLUMNS: ColumnDef[] = [
  { key: 'backlog',    status: 'backlog',     label: 'Backlog',     hint: 'ready to pick up',    Icon: Inbox,         accent: 'neutral' },
  { key: 'claimed',    status: 'claimed',     label: 'Claimed',     hint: 'owned, not started',  Icon: ClipboardList, accent: 'neutral' },
  { key: 'inProgress', status: 'in_progress', label: 'In Progress', hint: 'agent working',       Icon: Activity,      accent: 'teal' },
  { key: 'blocked',    status: 'blocked',     label: 'Blocked',     hint: 'waiting on something', Icon: AlertTriangle, accent: 'warn' },
  { key: 'inReview',   status: 'in_review',   label: 'In Review',   hint: 'needs sign-off',      Icon: Clock,         accent: 'warn' },
  { key: 'done',       status: 'done',        label: 'Done',        hint: 'completed',            Icon: CheckCircle2,  accent: 'ok' },
  { key: 'failed',     status: 'failed',      label: 'Failed',      hint: 'halted',               Icon: XCircle,       accent: 'error' },
]

/* Per-accent border-top + label-color combinations for kanban columns. */
const COL_TOP: Record<Accent, string> = {
  neutral: 'border-t-2 border-t-border-strong',
  teal:    'border-t-2 border-t-teal-400',
  warn:    'border-t-2 border-t-warning',
  ok:      'border-t-2 border-t-success',
  error:   'border-t-2 border-t-error',
}
const COL_LABEL_COLOR: Record<Accent, string> = {
  neutral: 'text-text-primary',
  teal:    'text-teal-400',
  warn:    'text-warning',
  ok:      'text-success',
  error:   'text-error',
}

/* Per-tone classes for the top stat tiles. */
const STAT_BORDER: Record<Accent, string> = {
  neutral: 'border-border-subtle bg-bg-card',
  teal:    'border-teal-line bg-teal-soft',
  warn:    'border-[rgba(245,193,24,0.3)] bg-[rgba(245,193,24,0.06)]',
  ok:      'border-[rgba(74,222,128,0.3)] bg-[rgba(74,222,128,0.06)]',
  error:   'border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.06)]',
}
const STAT_VALUE_COLOR: Record<Accent, string> = {
  neutral: 'text-text-primary',
  teal:    'text-teal-400',
  warn:    'text-warning',
  ok:      'text-success',
  error:   'text-error',
}

/* Priority pill styles (legacy classes are deleted; Tailwind owns this now). */
const PRIORITY_CLASS: Record<TaskPriority, string> = {
  low:      'text-text-muted bg-bg-panel border-border-subtle',
  medium:   'text-teal-400 bg-bg-panel border-teal-line',
  high:     'text-warning bg-[rgba(245,193,24,0.08)] border-[rgba(245,193,24,0.35)]',
  critical: 'text-error bg-[rgba(248,113,113,0.1)] border-[rgba(248,113,113,0.35)]',
}

export default function Kanban() {
  const qc = useQueryClient()
  const [agentFilter, setAgentFilter] = useState<string | null>(null)

  const board = useQuery({
    queryKey: ['kanban', 'board'],
    queryFn: getBoard,
    refetchInterval: 4000,
  })

  const destroy = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kanban', 'board'] }),
  })

  /* Agents active on the board — used to drive the "assigned" filter. */
  const allAgents = useMemo(() => {
    if (!board.data) return []
    const seen = new Set<string>()
    for (const col of Object.values(board.data.columns)) {
      for (const t of col as KanbanTask[]) {
        if (t.assigned_agent) seen.add(t.assigned_agent)
      }
    }
    return Array.from(seen).sort()
  }, [board.data])

  function tasksFor(col: ColumnDef): KanbanTask[] {
    if (!board.data) return []
    const raw = (board.data.columns[col.key] ?? []) as KanbanTask[]
    return agentFilter ? raw.filter((t) => t.assigned_agent === agentFilter) : raw
  }

  const stats = board.data?.stats

  return (
    <div className="page--framed">
      <PageTopbar
        eyebrow="Orchestration"
        title="Kanban"
        actions={
          <button
            type="button"
            className="btn btn--square"
            onClick={() => board.refetch()}
            disabled={board.isFetching}
            aria-label="Refresh"
          >
            <RefreshCw
              size={13}
              strokeWidth={1.7}
              className={cn(board.isFetching && 'update-section__spin')}
            />
          </button>
        }
      />

      <div className="page__body pb-3">
        <div className="grid grid-cols-6 gap-2">
          <StatBadge label="Total"       value={stats?.total}       loading={board.isLoading} />
          <StatBadge label="In Progress" value={stats?.in_progress} tone="teal"  loading={board.isLoading} />
          <StatBadge label="Blocked"     value={stats?.blocked}     tone="warn"  loading={board.isLoading} />
          <StatBadge label="In Review"   value={stats?.in_review}   tone="warn"  loading={board.isLoading} />
          <StatBadge label="Done"        value={stats?.done}        tone="ok"    loading={board.isLoading} />
          <StatBadge label="Failed"      value={stats?.failed}      tone="error" loading={board.isLoading} />
        </div>

        {allAgents.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Users size={13} strokeWidth={1.7} className="mr-1 text-text-dim" />
            <button
              type="button"
              className={cn('chip', agentFilter === null && 'chip--active')}
              onClick={() => setAgentFilter(null)}
            >
              all agents
            </button>
            {allAgents.map((name) => (
              <button
                key={name}
                type="button"
                className={cn('chip', agentFilter === name && 'chip--active')}
                onClick={() => setAgentFilter(name)}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {board.isError && (
          <p className="kg-hint">Couldn&apos;t reach the embedded server.</p>
        )}

        {(board.isLoading || board.data) && (
          <div className="grid grid-cols-[repeat(7,minmax(240px,1fr))] gap-3 overflow-x-auto pb-2">
            {COLUMNS.map((col) => {
              const tasks = board.data ? tasksFor(col) : []
              const loading = board.isLoading
              return (
                <section
                  key={col.key}
                  className={cn(
                    'flex min-h-0 flex-col gap-1.5 rounded-md border border-border-subtle bg-bg-panel px-2.5 pb-3 pt-2.5',
                    COL_TOP[col.accent],
                  )}
                >
                  <header className="flex items-center justify-between gap-2 px-1 pt-1">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 font-sans text-[11px] font-bold uppercase tracking-[0.12em]',
                        COL_LABEL_COLOR[col.accent],
                      )}
                    >
                      <col.Icon size={13} strokeWidth={1.7} />
                      {col.label}
                    </span>
                    {loading ? (
                      <Skeleton width={24} height={14} rounded />
                    ) : (
                      <span className="mono rounded-full border border-border-subtle bg-bg-card px-1.5 py-0.5 text-[11px] text-text-muted">
                        {tasks.length}
                      </span>
                    )}
                  </header>
                  <p className="m-0 mb-1 ml-1 font-sans text-[10px] tracking-[0.02em] text-text-dim">
                    {col.hint}
                  </p>
                  <div className="flex flex-col gap-2">
                    {loading ? (
                      <>
                        <SkeletonKanbanCard />
                        <SkeletonKanbanCard />
                        <SkeletonKanbanCard />
                      </>
                    ) : tasks.length === 0 ? (
                      <p className="m-0 px-0 pb-2 pt-6 text-center text-sm text-text-dim">—</p>
                    ) : (
                      tasks.map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          onDelete={() => destroy.mutate(t.id)}
                          deleting={destroy.isPending && destroy.variables === t.id}
                        />
                      ))
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StatBadge({
  label,
  value,
  tone = 'neutral',
  loading,
}: {
  label: string
  value?: number
  tone?: Accent
  loading?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-md border px-3 py-2.5',
        STAT_BORDER[tone],
      )}
    >
      <span className="mono text-[9px] uppercase tracking-[0.16em] text-text-dim">
        {label}
      </span>
      {loading ? (
        <Skeleton width={36} height={22} />
      ) : (
        <span
          className={cn(
            'font-sans text-[22px] font-semibold tracking-[-0.01em]',
            STAT_VALUE_COLOR[tone],
          )}
        >
          {value ?? 0}
        </span>
      )}
    </div>
  )
}

function TaskCard({
  task,
  onDelete,
  deleting,
}: {
  task: KanbanTask
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <article className="group flex flex-col gap-1.5 rounded-md border border-border-subtle bg-bg-card px-3 py-2.5 transition-[border-color,box-shadow] duration-150 ease-ease-cubic hover:border-border-strong hover:shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)]">
      <header className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'mono inline-block rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]',
            PRIORITY_CLASS[task.priority],
          )}
        >
          {priorityLabel(task.priority)}
        </span>
        <button
          type="button"
          className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-text-dim opacity-0 transition-[opacity,color,background] duration-150 ease-ease-cubic hover:bg-[rgba(248,113,113,0.12)] hover:text-error group-hover:opacity-100"
          onClick={onDelete}
          disabled={deleting}
          aria-label="Delete task"
          title="Delete task"
        >
          <Trash2 size={11} strokeWidth={1.7} />
        </button>
      </header>
      <h3 className="m-0 line-clamp-2 font-sans text-[13px] font-medium leading-[1.35] text-text-primary">
        {task.title}
      </h3>
      {task.description && (
        <p className="m-0 line-clamp-3 font-sans text-[11.5px] leading-[1.45] text-text-muted">
          {task.description}
        </p>
      )}
      {(task.assigned_agent || task.tags.length > 0) && (
        <footer className="mt-0.5 flex flex-wrap items-center gap-1">
          {task.assigned_agent && (
            <span className="mono rounded-sm bg-teal-soft px-1.5 py-0.5 text-[10px] tracking-[0.02em] text-teal-400">
              @{task.assigned_agent}
            </span>
          )}
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="mono rounded-sm border border-border-subtle bg-[rgb(0_0_0_/_0.03)] px-1.5 py-0.5 text-[9px] tracking-[0.02em] text-text-muted dark:bg-[rgb(255_255_255_/_0.04)]"
            >
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="mono rounded-sm border border-border-subtle bg-[rgb(0_0_0_/_0.03)] px-1.5 py-0.5 text-[9px] tracking-[0.02em] text-text-dim dark:bg-[rgb(255_255_255_/_0.04)]">
              +{task.tags.length - 3}
            </span>
          )}
        </footer>
      )}
      {task.block_reason && (
        <p className="mono m-0 mt-0.5 break-words rounded bg-[rgba(245,193,24,0.08)] px-2 py-1 text-[10px] text-warning">
          {task.block_reason}
        </p>
      )}
    </article>
  )
}

function priorityLabel(p: TaskPriority): string {
  return p
}
