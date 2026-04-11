import type { KanbanTask } from './kanban-types';
import { useKanbanRealtimeStore } from './kanban-realtime-store';
import { cn } from '@/lib/utils';

interface SessionTabStripProps {
  inProgressTasks: KanbanTask[];
  onTabClick: (taskId: string) => void;
}

export function SessionTabStrip({ inProgressTasks, onTabClick }: SessionTabStripProps) {
  const taskScores = useKanbanRealtimeStore((s) => s.taskScores);

  if (inProgressTasks.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      {inProgressTasks.map((task) => {
        const isGrading = Boolean(taskScores[task.id]);
        return (
          <button
            key={task.id}
            type="button"
            onClick={() => onTabClick(task.id)}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors',
              'border-border/50 bg-card/70 text-muted-foreground',
              'hover:border-border hover:text-foreground',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                isGrading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-pulse',
              )}
            />
            <span className="font-medium">
              {task.assignedAgent ?? 'agent'}
            </span>
            <span className="text-muted-foreground/60">·</span>
            <span className="max-w-[120px] truncate">
              {task.title.length > 24 ? `${task.title.slice(0, 24)}…` : task.title}
            </span>
          </button>
        );
      })}
    </div>
  );
}
