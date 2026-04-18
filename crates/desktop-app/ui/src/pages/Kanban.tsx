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

type ColumnDef = {
  key: keyof import('@/api/kanban').KanbanBoardColumns
  status: TaskStatus
  label: string
  hint: string
  Icon: LucideIcon
  accent: 'neutral' | 'teal' | 'warn' | 'error' | 'ok'
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

      <div className="page__body kanban-page">
        <div className="kanban-stats">
          <StatBadge label="Total"       value={stats?.total}       loading={board.isLoading} />
          <StatBadge label="In Progress" value={stats?.in_progress} tone="teal"  loading={board.isLoading} />
          <StatBadge label="Blocked"     value={stats?.blocked}     tone="warn"  loading={board.isLoading} />
          <StatBadge label="In Review"   value={stats?.in_review}   tone="warn"  loading={board.isLoading} />
          <StatBadge label="Done"        value={stats?.done}        tone="ok"    loading={board.isLoading} />
          <StatBadge label="Failed"      value={stats?.failed}      tone="error" loading={board.isLoading} />
        </div>

        {allAgents.length > 0 && (
          <div className="kanban-filter">
            <Users size={13} strokeWidth={1.7} className="kanban-filter__icon" />
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
          <div className="kanban-board">
            {COLUMNS.map((col) => {
              const tasks = board.data ? tasksFor(col) : []
              const loading = board.isLoading
              return (
                <section
                  key={col.key}
                  className={cn('kanban-col', `kanban-col--${col.accent}`)}
                >
                  <header className="kanban-col__head">
                    <span className="kanban-col__label">
                      <col.Icon size={13} strokeWidth={1.7} />
                      {col.label}
                    </span>
                    {loading ? (
                      <Skeleton width={24} height={14} rounded />
                    ) : (
                      <span className="kanban-col__count mono">{tasks.length}</span>
                    )}
                  </header>
                  <p className="kanban-col__hint">{col.hint}</p>
                  <div className="kanban-col__list">
                    {loading ? (
                      <>
                        <SkeletonKanbanCard />
                        <SkeletonKanbanCard />
                        <SkeletonKanbanCard />
                      </>
                    ) : tasks.length === 0 ? (
                      <p className="kanban-col__empty">—</p>
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
  tone?: 'neutral' | 'teal' | 'warn' | 'ok' | 'error'
  loading?: boolean
}) {
  return (
    <div className={cn('kanban-stat', `kanban-stat--${tone}`)}>
      <span className="kanban-stat__label mono">{label}</span>
      {loading ? (
        <Skeleton width={36} height={22} />
      ) : (
        <span className="kanban-stat__value">{value ?? 0}</span>
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
    <article className="kanban-card">
      <header className="kanban-card__head">
        <span className={cn('kanban-priority', `kanban-priority--${task.priority}`)}>
          {priorityLabel(task.priority)}
        </span>
        <button
          type="button"
          className="kanban-card__delete"
          onClick={onDelete}
          disabled={deleting}
          aria-label="Delete task"
          title="Delete task"
        >
          <Trash2 size={11} strokeWidth={1.7} />
        </button>
      </header>
      <h3 className="kanban-card__title">{task.title}</h3>
      {task.description && (
        <p className="kanban-card__desc">{task.description}</p>
      )}
      {(task.assigned_agent || task.tags.length > 0) && (
        <footer className="kanban-card__meta">
          {task.assigned_agent && (
            <span className="kanban-card__agent mono">@{task.assigned_agent}</span>
          )}
          {task.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="kanban-card__tag">{tag}</span>
          ))}
          {task.tags.length > 3 && (
            <span className="kanban-card__tag kanban-card__tag--muted">
              +{task.tags.length - 3}
            </span>
          )}
        </footer>
      )}
      {task.block_reason && (
        <p className="kanban-card__block">{task.block_reason}</p>
      )}
    </article>
  )
}

function priorityLabel(p: TaskPriority): string {
  return p
}
