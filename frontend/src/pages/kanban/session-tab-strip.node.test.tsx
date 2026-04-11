import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { KanbanTask } from './kanban-types';
import type { TaskScore } from './kanban-realtime-store';

// ---------------------------------------------------------------------------
// Mocks — vi.mock calls are hoisted by Vitest to before any imports at runtime.
// They must appear before the SessionTabStrip import so the mock is in place
// when session-tab-strip.tsx is first evaluated.
// ---------------------------------------------------------------------------

vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => (args.filter(Boolean) as string[]).join(' '),
}));

// Mutable object the mock selector reads from; tests mutate it directly.
// This sidesteps the SSR limitation where useSyncExternalStore always returns
// the store's initial (creation-time) state via getServerSnapshot.
let mockTaskScores: Record<string, TaskScore> = {};

vi.mock('./kanban-realtime-store', () => ({
  useKanbanRealtimeStore: (selector: (s: { taskScores: Record<string, TaskScore> }) => unknown) =>
    selector({ taskScores: mockTaskScores }),
}));

import { SessionTabStrip } from './session-tab-strip';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal KanbanTask with sensible defaults; override as needed. */
function makeTask(overrides: Partial<KanbanTask> & { id: string; title: string }): KanbanTask {
  return {
    sourceRequestId: null,
    parentTaskId: null,
    description: '',
    tags: [],
    priority: 'medium',
    status: 'in_progress',
    assignedAgent: null,
    conversationId: null,
    result: null,
    reviewFeedback: null,
    blockReason: null,
    complexityLevel: 1,
    depth: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    claimedAt: null,
    completedAt: null,
    revisionCount: 0,
    notifyConversationId: null,
    ...overrides,
  };
}

const noop = () => {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionTabStrip', () => {
  beforeEach(() => {
    // Reset mock store state before each test
    mockTaskScores = {};
  });

  it('renders nothing when inProgressTasks is empty', () => {
    const html = renderToStaticMarkup(
      <SessionTabStrip inProgressTasks={[]} onTabClick={noop} />,
    );
    expect(html).toBe('');
  });

  it('renders one <button> per task', () => {
    const tasks = [
      makeTask({ id: 'a', title: 'Task A' }),
      makeTask({ id: 'b', title: 'Task B' }),
    ];
    const html = renderToStaticMarkup(
      <SessionTabStrip inProgressTasks={tasks} onTabClick={noop} />,
    );
    const matches = html.match(/<button/g);
    expect(matches).toHaveLength(2);
  });

  it('shows assignedAgent name when present', () => {
    const task = makeTask({ id: '1', title: 'Do something', assignedAgent: 'alpha' });
    const html = renderToStaticMarkup(
      <SessionTabStrip inProgressTasks={[task]} onTabClick={noop} />,
    );
    expect(html).toContain('alpha');
  });

  it('falls back to "agent" when assignedAgent is null', () => {
    const task = makeTask({ id: '1', title: 'Do something', assignedAgent: null });
    const html = renderToStaticMarkup(
      <SessionTabStrip inProgressTasks={[task]} onTabClick={noop} />,
    );
    expect(html).toContain('>agent<');
  });

  it('shows the separator · between agent name and title', () => {
    const task = makeTask({ id: '1', title: 'Do something', assignedAgent: 'beta' });
    const html = renderToStaticMarkup(
      <SessionTabStrip inProgressTasks={[task]} onTabClick={noop} />,
    );
    expect(html).toContain('·');
  });

  it('shows the full title when it is 24 chars or fewer', () => {
    const title = 'Exactly twenty-four!!!';   // 22 chars — no truncation
    const task = makeTask({ id: '1', title });
    const html = renderToStaticMarkup(
      <SessionTabStrip inProgressTasks={[task]} onTabClick={noop} />,
    );
    expect(html).toContain(title);
    expect(html).not.toContain('…');
  });

  it('truncates title at 24 chars with … when title is longer', () => {
    const title = 'This title is definitely longer than twenty-four characters';
    const task = makeTask({ id: '1', title });
    const html = renderToStaticMarkup(
      <SessionTabStrip inProgressTasks={[task]} onTabClick={noop} />,
    );
    // Component slices at 24 and appends U+2026
    expect(html).toContain(`${title.slice(0, 24)}\u2026`);
    expect(html).not.toContain(title);
  });

  it('shows bg-emerald-400 when no score exists in store (running state)', () => {
    const task = makeTask({ id: 'running-task', title: 'Running task' });
    // mockTaskScores is empty — no score for this task
    const html = renderToStaticMarkup(
      <SessionTabStrip inProgressTasks={[task]} onTabClick={noop} />,
    );
    expect(html).toContain('bg-emerald-400');
    expect(html).not.toContain('bg-amber-400');
  });

  it('shows bg-amber-400 when a score exists in store (grading state)', () => {
    const task = makeTask({ id: 'grading-task', title: 'Grading task' });
    mockTaskScores['grading-task'] = { prev: 0, current: 5, iteration: 1 };
    const html = renderToStaticMarkup(
      <SessionTabStrip inProgressTasks={[task]} onTabClick={noop} />,
    );
    expect(html).toContain('bg-amber-400');
    expect(html).not.toContain('bg-emerald-400');
  });

  it('renders amber for grading task and emerald for running task in the same render', () => {
    const gradingTask = makeTask({ id: 'grading', title: 'Grading task' });
    const runningTask = makeTask({ id: 'running', title: 'Running task' });

    // Only the grading task has a score — running task has none
    mockTaskScores['grading'] = { prev: 0, current: 8, iteration: 2 };

    const html = renderToStaticMarkup(
      <SessionTabStrip inProgressTasks={[gradingTask, runningTask]} onTabClick={noop} />,
    );

    expect(html).toContain('bg-amber-400');
    expect(html).toContain('bg-emerald-400');
  });
});
