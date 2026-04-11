import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  LayersIcon,
  PlayCircleIcon,
  RefreshCwIcon,
  Trash2Icon,
  XCircleIcon,
} from 'lucide-react';

import type {
  KanbanBoardColumns,
  KanbanBoardResponse,
  KanbanTask,
  TaskPriority,
  TaskStatus,
} from './kanban-types';
import { KANBAN_COLUMNS } from './kanban-types';
import { useChatWsConnection } from '@/hooks/use-chat-ws';
import { useKanbanBoard } from './use-kanban-board';
import { useKanbanRealtimeStore, type ToolEvent } from './kanban-realtime-store';

export function KanbanPage() {
  const { isConnected } = useChatWsConnection();
  const { board, loading, refreshing, error, refresh, deleteTask } = useKanbanBoard(true, isConnected);

  return (
    <div className="flex flex-col h-full bg-background min-h-[calc(100vh-72px)] p-6 md:p-8 overflow-y-auto w-full">
      <div className="w-full space-y-6 pb-12">
        {/* Header */}
        <KanbanHeader board={board} refreshing={refreshing} onRefresh={refresh} />

        {/* Error state */}
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {/* Loading state */}
        {loading && !board ? (
          <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">
            Loading kanban board...
          </div>
        ) : null}

        {/* Stats bar */}
        {board ? <KanbanStatsBar stats={board.stats} /> : null}

        {/* Board columns */}
        {board ? <KanbanBoard columns={board.columns} onDeleteTask={deleteTask} /> : null}

        {/* Empty state */}
        {!loading && board && board.stats.total === 0 ? (
          <div className="rounded-lg border border-border/50 bg-card p-8 text-center space-y-2">
            <LayersIcon className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No tasks on the board</p>
            <p className="text-xs text-muted-foreground/70">
              When agents collaborate on complex requests, tasks will appear here automatically.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function KanbanHeader({
  board,
  refreshing,
  onRefresh,
}: {
  board: KanbanBoardResponse | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Kanban view of inter-agent collaboration tasks.
        </p>
        {board?.generatedAt ? (
          <Badge variant="outline" className="text-[10px] border-border/50 bg-muted/40 font-mono">
            Updated {formatDateTime(board.generatedAt)}
          </Badge>
        ) : null}
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
        <RefreshCwIcon className={`w-3.5 h-3.5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
        Refresh
      </Button>
    </div>
  );
}

function KanbanStatsBar({ stats }: { stats: KanbanBoardResponse['stats'] }) {
  if (stats.total === 0) return null;

  const items = [
    { label: 'Total', value: stats.total, icon: LayersIcon },
    { label: 'Active', value: stats.inProgress + stats.claimed, icon: PlayCircleIcon },
    { label: 'Blocked', value: stats.blocked, icon: AlertCircleIcon },
    { label: 'In Review', value: stats.inReview, icon: ClockIcon },
    { label: 'Done', value: stats.done, icon: CheckCircle2Icon },
    { label: 'Failed', value: stats.failed, icon: XCircleIcon },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border/50 bg-card/70 p-3 space-y-1"
        >
          <div className="flex items-center gap-1.5">
            <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground font-medium">{item.label}</p>
          </div>
          <p className="text-lg font-semibold tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function KanbanBoard({
  columns,
  onDeleteTask,
}: {
  columns: KanbanBoardColumns;
  onDeleteTask: (taskId: string) => Promise<void>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7 gap-3">
      {KANBAN_COLUMNS.map((col) => {
        const tasks = columns[col.key] ?? [];
        return (
          <section
            key={col.key}
            className="rounded-xl border border-border/50 bg-card/70 p-3 space-y-3 min-h-[200px]"
          >
            <div className="flex items-center justify-between">
              <p className={`text-xs font-semibold uppercase tracking-widest ${col.color}`}>
                {col.label}
              </p>
              <Badge variant="outline" className="text-[10px] border-border/50 bg-muted/40">
                {tasks.length}
              </Badge>
            </div>

            {tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">{col.emptyLabel}</p>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <TaskCard key={task.id} task={task} onDelete={onDeleteTask} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function TaskEventFeed({ taskId }: { taskId: string }) {
  const toolEvents = useKanbanRealtimeStore((s) => s.toolEvents[taskId] ?? []);

  if (toolEvents.length === 0) return null;

  const visible = toolEvents.slice(-4);

  return (
    <div className="mt-2 border-t border-border/40 pt-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>Live</span>
        <span className="ml-auto">{toolEvents.length} events</span>
      </div>
      <div className="relative">
        {toolEvents.length > 4 && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-background to-transparent z-10" />
        )}
        <div className="space-y-0.5">
          {visible.map((ev, i) => (
            <EventLine key={i} event={ev} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EventLine({ event }: { event: ToolEvent }) {
  const isDone = event.status === 'end';
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className={isDone ? 'text-emerald-500' : 'text-amber-400'}>
        {isDone ? '✓' : '⟳'}
      </span>
      <span className="truncate">{event.label}</span>
    </div>
  );
}

function ScoreFooter({ taskId }: { taskId: string }) {
  const score = useKanbanRealtimeStore((s) => s.taskScores[taskId]);

  if (!score) return null;

  return (
    <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2">
      <span className="text-[10px] text-muted-foreground/50">
        iter {score.iteration}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800/40 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
        <span className="text-muted-foreground/40 line-through mr-0.5">{score.prev}</span>
        {score.current}
      </span>
    </div>
  );
}

function TaskCard({
  task,
  onDelete,
}: {
  task: KanbanTask;
  onDelete: (taskId: string) => Promise<void>;
}) {
  return (
    <article id={`kanban-card-${task.id}`} className="group relative rounded-md border border-border/50 bg-background p-3 space-y-2 transition-colors hover:border-border">
      {/* Delete button — visible on hover */}
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        title="Delete task"
      >
        <Trash2Icon className="w-3.5 h-3.5" />
      </button>

      {/* Title + Priority */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-snug line-clamp-2">{task.title}</p>
        <PriorityBadge priority={task.priority} />
      </div>

      {/* Tags */}
      {task.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {task.tags.slice(0, 4).map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="text-[9px] border-border/50 bg-muted/30 font-mono"
            >
              {tag}
            </Badge>
          ))}
          {task.tags.length > 4 ? (
            <Badge variant="outline" className="text-[9px] border-border/50 bg-muted/30">
              +{task.tags.length - 4}
            </Badge>
          ) : null}
        </div>
      ) : null}

      {/* Agent assignment */}
      {task.assignedAgent ? (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/70">{task.assignedAgent}</span>
        </p>
      ) : null}

      {/* Block reason */}
      {task.blockReason ? (
        <p className="text-[11px] text-red-500 line-clamp-2">
          Blocked: {task.blockReason}
        </p>
      ) : null}

      {/* Review feedback */}
      {task.reviewFeedback ? (
        <p className="text-[11px] text-purple-500 line-clamp-2">
          Feedback: {task.reviewFeedback}
        </p>
      ) : null}

      {/* Result preview (for done tasks) */}
      {task.result && task.status === 'done' ? (
        <p className="text-[11px] text-green-600 line-clamp-2">
          {task.result}
        </p>
      ) : null}

      {/* Footer meta */}
      <div className="text-[10px] text-muted-foreground/60 space-y-0.5">
        {task.depth > 0 ? (
          <p className="font-mono">subtask (depth {task.depth})</p>
        ) : null}
        <p>{formatRelativeTime(task.updatedAt)}</p>
      </div>

      {/* Metadata footer — revisions, step type, parent link */}
      {(task.revisionCount > 0 || task.parentTaskId) && (
        <div className="flex items-center justify-between border-t border-border/40 pt-1.5 mt-1.5">
          {task.revisionCount > 0 && (
            <span className="text-[8px] text-purple-400 tracking-wide">
              ↻ {task.revisionCount} revision{task.revisionCount > 1 ? 's' : ''}
            </span>
          )}
          {task.parentTaskId && (
            <span className="text-[8px] text-muted-foreground tracking-wide truncate max-w-[120px]">
              ↗ subtask
            </span>
          )}
        </div>
      )}

      {task.status === 'in_progress' && <TaskEventFeed taskId={task.id} />}
      {task.status === 'in_progress' && <ScoreFooter taskId={task.id} />}
    </article>
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const variants: Record<TaskPriority, { label: string; className: string }> = {
    critical: { label: 'Critical', className: 'bg-red-500/10 text-red-500 border-red-500/30' },
    high: { label: 'High', className: 'bg-orange-500/10 text-orange-500 border-orange-500/30' },
    medium: { label: 'Med', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
    low: { label: 'Low', className: 'bg-muted/40 text-muted-foreground border-border/50' },
  };
  const v = variants[priority] ?? variants.medium;
  return (
    <Badge variant="outline" className={`text-[9px] h-4 shrink-0 ${v.className}`}>
      {v.label}
    </Badge>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export default KanbanPage;
