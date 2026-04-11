import { describe, it, expect, beforeEach } from 'vitest';
import { useKanbanRealtimeStore, type ToolEvent } from './kanban-realtime-store';

// Reset store to clean slate before every test so tests don't bleed into each other.
beforeEach(() => {
  useKanbanRealtimeStore.setState({ toolEvents: {}, taskScores: {} });
});

// ── Helper ────────────────────────────────────────────────────────────────────

function makeEvent(overrides?: Partial<ToolEvent>): ToolEvent {
  return {
    tool_name: 'read',
    label: 'Read file.ts',
    status: 'start',
    timestamp: 1000,
    ...overrides,
  };
}

// ── appendToolEvent ───────────────────────────────────────────────────────────

describe('appendToolEvent', () => {
  it('adds an event to the correct taskId', () => {
    const { appendToolEvent } = useKanbanRealtimeStore.getState();
    appendToolEvent('task-1', makeEvent({ label: 'Read foo.ts' }));

    const { toolEvents } = useKanbanRealtimeStore.getState();
    expect(toolEvents['task-1']).toHaveLength(1);
    expect(toolEvents['task-1'][0].label).toBe('Read foo.ts');
  });

  it('initialises an empty array for a new taskId', () => {
    const { appendToolEvent } = useKanbanRealtimeStore.getState();
    appendToolEvent('task-new', makeEvent());

    const { toolEvents } = useKanbanRealtimeStore.getState();
    expect(toolEvents['task-new']).toBeDefined();
    expect(toolEvents['task-new']).toHaveLength(1);
  });

  it('accumulates multiple events in order', () => {
    const { appendToolEvent } = useKanbanRealtimeStore.getState();
    appendToolEvent('task-1', makeEvent({ label: 'Read a.ts', timestamp: 1 }));
    appendToolEvent('task-1', makeEvent({ label: 'Edit b.ts', timestamp: 2 }));
    appendToolEvent('task-1', makeEvent({ label: 'Bash: build', timestamp: 3 }));

    const events = useKanbanRealtimeStore.getState().toolEvents['task-1'];
    expect(events).toHaveLength(3);
    expect(events[0].label).toBe('Read a.ts');
    expect(events[2].label).toBe('Bash: build');
  });

  it('caps events at 50 — oldest event is dropped when limit is exceeded', () => {
    const { appendToolEvent } = useKanbanRealtimeStore.getState();

    // Add 51 events. The first one should be evicted.
    for (let i = 0; i < 51; i++) {
      appendToolEvent('task-1', makeEvent({ label: `event-${i}`, timestamp: i }));
    }

    const events = useKanbanRealtimeStore.getState().toolEvents['task-1'];
    expect(events).toHaveLength(50);
    // event-0 was evicted; event-1 is now the oldest
    expect(events[0].label).toBe('event-1');
    // event-50 is the newest
    expect(events[49].label).toBe('event-50');
  });

  it('does not affect other tasks', () => {
    const { appendToolEvent } = useKanbanRealtimeStore.getState();
    appendToolEvent('task-A', makeEvent({ label: 'Read A.ts' }));
    appendToolEvent('task-B', makeEvent({ label: 'Edit B.ts' }));

    const { toolEvents } = useKanbanRealtimeStore.getState();
    expect(toolEvents['task-A']).toHaveLength(1);
    expect(toolEvents['task-B']).toHaveLength(1);
    expect(toolEvents['task-A'][0].label).toBe('Read A.ts');
    expect(toolEvents['task-B'][0].label).toBe('Edit B.ts');
  });
});

// ── updateScore ───────────────────────────────────────────────────────────────

describe('updateScore', () => {
  it('stores prev, current, and iteration for a taskId', () => {
    const { updateScore } = useKanbanRealtimeStore.getState();
    updateScore('task-1', 62, 96, 2);

    const score = useKanbanRealtimeStore.getState().taskScores['task-1'];
    expect(score).toEqual({ prev: 62, current: 96, iteration: 2 });
  });

  it('overwrites a previous score for the same taskId', () => {
    const { updateScore } = useKanbanRealtimeStore.getState();
    updateScore('task-1', 50, 70, 1);
    updateScore('task-1', 70, 90, 2);

    const score = useKanbanRealtimeStore.getState().taskScores['task-1'];
    expect(score).toEqual({ prev: 70, current: 90, iteration: 2 });
  });

  it('does not affect other tasks', () => {
    const { updateScore } = useKanbanRealtimeStore.getState();
    updateScore('task-A', 10, 80, 1);
    updateScore('task-B', 20, 60, 1);

    const { taskScores } = useKanbanRealtimeStore.getState();
    expect(taskScores['task-A'].current).toBe(80);
    expect(taskScores['task-B'].current).toBe(60);
  });
});

// ── clearTask ─────────────────────────────────────────────────────────────────

describe('clearTask', () => {
  it('removes toolEvents for the given taskId', () => {
    const { appendToolEvent, clearTask } = useKanbanRealtimeStore.getState();
    appendToolEvent('task-1', makeEvent());
    clearTask('task-1');

    const { toolEvents } = useKanbanRealtimeStore.getState();
    expect(toolEvents['task-1']).toBeUndefined();
  });

  it('removes taskScores for the given taskId', () => {
    const { updateScore, clearTask } = useKanbanRealtimeStore.getState();
    updateScore('task-1', 62, 96, 2);
    clearTask('task-1');

    const { taskScores } = useKanbanRealtimeStore.getState();
    expect(taskScores['task-1']).toBeUndefined();
  });

  it('leaves other tasks untouched', () => {
    const { appendToolEvent, updateScore, clearTask } =
      useKanbanRealtimeStore.getState();

    appendToolEvent('task-A', makeEvent());
    appendToolEvent('task-B', makeEvent());
    updateScore('task-A', 10, 80, 1);
    updateScore('task-B', 20, 60, 1);

    clearTask('task-A');

    const { toolEvents, taskScores } = useKanbanRealtimeStore.getState();
    expect(toolEvents['task-A']).toBeUndefined();
    expect(taskScores['task-A']).toBeUndefined();
    expect(toolEvents['task-B']).toHaveLength(1);
    expect(taskScores['task-B']?.current).toBe(60);
  });

  it('is a no-op for an unknown taskId', () => {
    const { clearTask } = useKanbanRealtimeStore.getState();
    // Should not throw
    expect(() => clearTask('does-not-exist')).not.toThrow();

    const { toolEvents, taskScores } = useKanbanRealtimeStore.getState();
    expect(Object.keys(toolEvents)).toHaveLength(0);
    expect(Object.keys(taskScores)).toHaveLength(0);
  });
});
