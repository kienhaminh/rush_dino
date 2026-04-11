import { create } from 'zustand';

export interface ToolEvent {
  tool_name: string;
  label: string;
  status: 'start' | 'end';
  timestamp: number;
}

export interface TaskScore {
  prev: number;
  current: number;
  iteration: number;
}

interface KanbanRealtimeState {
  /** Capped at 50 events per task; keyed by task_id */
  toolEvents: Record<string, ToolEvent[]>;
  /** Score state per task; keyed by task_id */
  taskScores: Record<string, TaskScore>;

  appendToolEvent: (taskId: string, event: ToolEvent) => void;
  updateScore: (taskId: string, oldScore: number, newScore: number, iteration: number) => void;
  clearTask: (taskId: string) => void;
}

const MAX_EVENTS_PER_TASK = 50;

export const useKanbanRealtimeStore = create<KanbanRealtimeState>((set) => ({
  toolEvents: {},
  taskScores: {},

  appendToolEvent: (taskId, event) =>
    set((state) => {
      const existing = state.toolEvents[taskId] ?? [];
      const updated = [...existing, event].slice(-MAX_EVENTS_PER_TASK);
      return { toolEvents: { ...state.toolEvents, [taskId]: updated } };
    }),

  updateScore: (taskId, oldScore, newScore, iteration) =>
    set((state) => ({
      taskScores: {
        ...state.taskScores,
        [taskId]: { prev: oldScore, current: newScore, iteration },
      },
    })),

  clearTask: (taskId) =>
    set((state) => {
      const { [taskId]: _events, ...restEvents } = state.toolEvents;
      const { [taskId]: _score, ...restScores } = state.taskScores;
      return { toolEvents: restEvents, taskScores: restScores };
    }),
}));
