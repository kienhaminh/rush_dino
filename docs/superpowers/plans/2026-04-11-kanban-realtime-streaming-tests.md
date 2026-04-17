# Kanban Real-Time Streaming — Test Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write unit and component tests for the three new pieces of the kanban real-time streaming feature: the Zustand store, the SessionTabStrip component, and the Rust `build_tool_label` helper.

**Architecture:** Frontend tests use Vitest in Node mode (`vitest.node.config.ts`) — no browser required. The Zustand store is tested by calling actions directly on the singleton and asserting on `getState()`. The SessionTabStrip is tested via `renderToStaticMarkup` (same pattern as existing node tests). Rust tests are inline `#[test]` functions in the `kanban_dispatcher.rs` `#[cfg(test)]` block.

**Tech Stack:** Vitest 4.x, `react-dom/server` (renderToStaticMarkup), Rust `#[test]`, `serde_json`

---

## File Map

| File | Action | What it tests |
|---|---|---|
| `frontend/src/pages/kanban/kanban-realtime-store.node.test.ts` | Create | All 3 store actions + event cap behaviour |
| `frontend/src/pages/kanban/session-tab-strip.node.test.tsx` | Create | Null render, tabs, agent/title display, dot colour |
| `crates/agent/src/kanban_dispatcher.rs` | Modify | `build_tool_label` pure-function tests inside existing `#[cfg(test)]` block |

---

## Task 1: Zustand Store Unit Tests

**Files:**
- Create: `frontend/src/pages/kanban/kanban-realtime-store.node.test.ts`

- [ ] **Step 1: Create the test file**

Create `frontend/src/pages/kanban/kanban-realtime-store.node.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests and verify they all pass**

```bash
cd /Users/kien.ha/Code/RushDino/.worktrees/kanban-realtime/frontend && \
  npx vitest run --config vitest.node.config.ts \
  src/pages/kanban/kanban-realtime-store.node.test.ts
```

Expected output: `✓ 13 tests` (or similar), zero failures.

If any test fails, read the error message carefully — the most common issue is a stale store state (ensure `beforeEach` reset is working).

- [ ] **Step 3: Commit**

```bash
cd /Users/kien.ha/Code/RushDino/.worktrees/kanban-realtime && \
  git add frontend/src/pages/kanban/kanban-realtime-store.node.test.ts && \
  git commit -m "test(kanban): unit tests for kanban-realtime-store Zustand actions"
```

---

## Task 2: SessionTabStrip Component Tests

**Files:**
- Create: `frontend/src/pages/kanban/session-tab-strip.node.test.tsx`

- [ ] **Step 1: Create the test file**

Create `frontend/src/pages/kanban/session-tab-strip.node.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useKanbanRealtimeStore } from './kanban-realtime-store';
import type { KanbanTask } from './kanban-types';

// cn is pure JS (clsx + tailwind-merge) — runs fine in Node as-is.
// Mock it to a simple joiner so tests don't depend on tailwind class merging.
vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => (args.filter(Boolean) as string[]).join(' '),
}));

import { SessionTabStrip } from './session-tab-strip';

// Reset store before every test.
beforeEach(() => {
  useKanbanRealtimeStore.setState({ toolEvents: {}, taskScores: {} });
});

// ── Helper ────────────────────────────────────────────────────────────────────

function makeTask(overrides?: Partial<KanbanTask>): KanbanTask {
  return {
    id: 'task-1',
    sourceRequestId: null,
    parentTaskId: null,
    title: 'Short title',
    description: '',
    tags: [],
    priority: 'medium',
    status: 'in_progress',
    assignedAgent: 'coder-agent',
    conversationId: null,
    result: null,
    reviewFeedback: null,
    blockReason: null,
    complexityLevel: 1,
    depth: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    claimedAt: null,
    completedAt: null,
    revisionCount: 0,
    notifyConversationId: null,
    ...overrides,
  };
}

function render(props: { inProgressTasks: KanbanTask[]; onTabClick?: (id: string) => void }) {
  return renderToStaticMarkup(
    <SessionTabStrip
      inProgressTasks={props.inProgressTasks}
      onTabClick={props.onTabClick ?? (() => {})}
    />,
  );
}

// ── Null render ───────────────────────────────────────────────────────────────

describe('SessionTabStrip — no tasks', () => {
  it('renders nothing when inProgressTasks is empty', () => {
    const html = render({ inProgressTasks: [] });
    expect(html).toBe('');
  });
});

// ── Tab rendering ─────────────────────────────────────────────────────────────

describe('SessionTabStrip — tab rendering', () => {
  it('renders one button per task', () => {
    const tasks = [
      makeTask({ id: 'task-1', title: 'First task' }),
      makeTask({ id: 'task-2', title: 'Second task' }),
    ];
    const html = render({ inProgressTasks: tasks });

    // Count <button> elements
    const buttonCount = (html.match(/<button/g) ?? []).length;
    expect(buttonCount).toBe(2);
  });

  it('shows assignedAgent when present', () => {
    const html = render({
      inProgressTasks: [makeTask({ assignedAgent: 'my-agent' })],
    });
    expect(html).toContain('my-agent');
  });

  it('falls back to "agent" when assignedAgent is null', () => {
    const html = render({
      inProgressTasks: [makeTask({ assignedAgent: null })],
    });
    expect(html).toContain('agent');
  });

  it('renders the separator dot between agent name and title', () => {
    const html = render({ inProgressTasks: [makeTask()] });
    expect(html).toContain('·');
  });
});

// ── Title truncation ──────────────────────────────────────────────────────────

describe('SessionTabStrip — title truncation', () => {
  it('shows full title when 24 chars or fewer', () => {
    const title = 'A'.repeat(24); // exactly 24 chars
    const html = render({ inProgressTasks: [makeTask({ title })] });
    expect(html).toContain(title);
    expect(html).not.toContain('…');
  });

  it('truncates title at 24 chars and appends ellipsis when longer', () => {
    const title = 'B'.repeat(25); // 25 chars — one over the limit
    const html = render({ inProgressTasks: [makeTask({ title })] });
    expect(html).toContain('B'.repeat(24) + '…');
    // The full 25-char string should NOT appear in the output
    expect(html).not.toContain('B'.repeat(25));
  });
});

// ── Pulse dot colour ──────────────────────────────────────────────────────────

describe('SessionTabStrip — pulse dot colour', () => {
  it('shows emerald dot when no score exists for the task (running)', () => {
    // No score in store → isGrading is false → emerald
    const html = render({ inProgressTasks: [makeTask({ id: 'task-1' })] });
    expect(html).toContain('bg-emerald-400');
    expect(html).not.toContain('bg-amber-400');
  });

  it('shows amber dot when a score entry exists for the task (grading)', () => {
    // Seed the store with a score for this task
    useKanbanRealtimeStore.setState({
      taskScores: { 'task-1': { prev: 62, current: 96, iteration: 2 } },
    });

    const html = render({ inProgressTasks: [makeTask({ id: 'task-1' })] });
    expect(html).toContain('bg-amber-400');
    expect(html).not.toContain('bg-emerald-400');
  });

  it('uses each task\'s own id for the score lookup', () => {
    // task-1 has a score (amber), task-2 does not (emerald)
    useKanbanRealtimeStore.setState({
      taskScores: { 'task-1': { prev: 50, current: 80, iteration: 1 } },
    });

    const tasks = [
      makeTask({ id: 'task-1', title: 'Grading task' }),
      makeTask({ id: 'task-2', title: 'Running task' }),
    ];
    const html = render({ inProgressTasks: tasks });
    expect(html).toContain('bg-amber-400');
    expect(html).toContain('bg-emerald-400');
  });
});
```

- [ ] **Step 2: Run the tests and verify they all pass**

```bash
cd /Users/kien.ha/Code/RushDino/.worktrees/kanban-realtime/frontend && \
  npx vitest run --config vitest.node.config.ts \
  src/pages/kanban/session-tab-strip.node.test.tsx
```

Expected: all tests pass. Common failure: if `cn` import fails, confirm the `vi.mock('@/lib/utils', ...)` is placed before the `SessionTabStrip` import (vi.mock is hoisted, but the import order matters for readability).

- [ ] **Step 3: Commit**

```bash
cd /Users/kien.ha/Code/RushDino/.worktrees/kanban-realtime && \
  git add frontend/src/pages/kanban/session-tab-strip.node.test.tsx && \
  git commit -m "test(kanban): component tests for SessionTabStrip"
```

---

## Task 3: Rust `build_tool_label` Unit Tests

**Files:**
- Modify: `crates/agent/src/kanban_dispatcher.rs` (add tests inside existing `#[cfg(test)]` block)

- [ ] **Step 1: Find the existing `#[cfg(test)]` block**

```bash
grep -n '#\[cfg(test)\]' /Users/kien.ha/Code/RushDino/.worktrees/kanban-realtime/crates/agent/src/kanban_dispatcher.rs
```

Note the line number. The existing tests (`heartbeat_interval_is_reasonable` and `daily_note_entry_format`) live there. You will add new tests inside the same `mod tests { }` block.

- [ ] **Step 2: Add `build_tool_label` tests inside the existing test module**

Find the closing `}` of the `mod tests` block and add these tests before it:

```rust
    // ── build_tool_label ──────────────────────────────────────────────────

    #[test]
    fn build_tool_label_read_extracts_filename() {
        let args = serde_json::json!({ "file_path": "/path/to/layout.css" });
        assert_eq!(build_tool_label("read", &args), "Read layout.css");
    }

    #[test]
    fn build_tool_label_read_uppercase_variant() {
        let args = serde_json::json!({ "file_path": "/src/main.rs" });
        assert_eq!(build_tool_label("Read", &args), "Read main.rs");
    }

    #[test]
    fn build_tool_label_edit_extracts_filename() {
        let args = serde_json::json!({ "file_path": "/src/kanban_dispatcher.rs" });
        assert_eq!(build_tool_label("edit", &args), "Edit kanban_dispatcher.rs");
    }

    #[test]
    fn build_tool_label_write_extracts_filename() {
        let args = serde_json::json!({ "file_path": "/out/report.md" });
        assert_eq!(build_tool_label("write", &args), "Write report.md");
    }

    #[test]
    fn build_tool_label_bash_short_command_kept_as_is() {
        let args = serde_json::json!({ "command": "cargo build" });
        assert_eq!(build_tool_label("bash", &args), "Bash: cargo build");
    }

    #[test]
    fn build_tool_label_bash_truncates_at_40_chars() {
        // 41-character command — should be cut at 40 with ellipsis appended.
        let cmd = "a".repeat(41);
        let args = serde_json::json!({ "command": cmd });
        let result = build_tool_label("bash", &args);
        // Prefix must be "Bash: " + 40 a's + "…"
        let expected = format!("Bash: {}…", "a".repeat(40));
        assert_eq!(result, expected);
    }

    #[test]
    fn build_tool_label_bash_exactly_40_chars_not_truncated() {
        let cmd = "b".repeat(40);
        let args = serde_json::json!({ "command": cmd });
        let result = build_tool_label("bash", &args);
        assert_eq!(result, format!("Bash: {}", "b".repeat(40)));
        assert!(!result.contains('…'), "40-char command should not be truncated");
    }

    #[test]
    fn build_tool_label_unknown_tool_returns_tool_name() {
        let args = serde_json::json!({});
        assert_eq!(build_tool_label("glob", &args), "glob");
        assert_eq!(build_tool_label("grep", &args), "grep");
        assert_eq!(build_tool_label("some_custom_tool", &args), "some_custom_tool");
    }

    #[test]
    fn build_tool_label_missing_file_path_falls_back_to_file() {
        let args = serde_json::json!({});
        assert_eq!(build_tool_label("read", &args), "Read file");
    }

    #[test]
    fn build_tool_label_missing_command_falls_back_to_command() {
        let args = serde_json::json!({});
        assert_eq!(build_tool_label("bash", &args), "Bash: command");
    }
```

- [ ] **Step 3: Run the tests to verify they all pass**

Find the correct package name first:
```bash
grep '^name' /Users/kien.ha/Code/RushDino/.worktrees/kanban-realtime/crates/agent/Cargo.toml
```

Then run (substituting the actual package name):
```bash
cd /Users/kien.ha/Code/RushDino/.worktrees/kanban-realtime && \
  cargo test -p <package-name> build_tool_label 2>&1 | grep -E 'test|FAILED|ok|error'
```

Expected output:
```
test build_tool_label_bash_exactly_40_chars_not_truncated ... ok
test build_tool_label_bash_short_command_kept_as_is ... ok
test build_tool_label_bash_truncates_at_40_chars ... ok
test build_tool_label_edit_extracts_filename ... ok
test build_tool_label_missing_command_falls_back_to_command ... ok
test build_tool_label_missing_file_path_falls_back_to_file ... ok
test build_tool_label_read_extracts_filename ... ok
test build_tool_label_read_uppercase_variant ... ok
test build_tool_label_unknown_tool_returns_tool_name ... ok
test build_tool_label_write_extracts_filename ... ok
```

If any test fails, read the failure output carefully. The most common issue is the exact ellipsis character (`…` U+2026 vs `...` three dots). Make sure the test strings match the implementation exactly.

- [ ] **Step 4: Run all dispatcher tests to ensure nothing broke**

```bash
cd /Users/kien.ha/Code/RushDino/.worktrees/kanban-realtime && \
  cargo test -p <package-name> -- kanban_dispatcher 2>&1 | grep -E 'test |FAILED|ok'
```

Expected: all existing tests (`heartbeat_interval_is_reasonable`, `daily_note_entry_format`) still pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kien.ha/Code/RushDino/.worktrees/kanban-realtime && \
  git add crates/agent/src/kanban_dispatcher.rs && \
  git commit -m "test(kanban): unit tests for build_tool_label in kanban_dispatcher"
```

---

## Task 4: Run All Tests Together

- [ ] **Step 1: Run all frontend node tests**

```bash
cd /Users/kien.ha/Code/RushDino/.worktrees/kanban-realtime/frontend && \
  npx vitest run --config vitest.node.config.ts \
  src/pages/kanban/kanban-realtime-store.node.test.ts \
  src/pages/kanban/session-tab-strip.node.test.tsx
```

Expected: all tests pass (13 store tests + 10 component tests = 23 total).

- [ ] **Step 2: Run all Rust dispatcher tests**

```bash
cd /Users/kien.ha/Code/RushDino/.worktrees/kanban-realtime && \
  cargo test -p <package-name> -- kanban_dispatcher 2>&1 | tail -10
```

Expected: 12 tests pass (2 existing + 10 new `build_tool_label` tests).

- [ ] **Step 3: Final commit if any cleanup needed**

If no changes since Task 3, skip this step. Otherwise:

```bash
cd /Users/kien.ha/Code/RushDino/.worktrees/kanban-realtime && \
  git add -A && git commit -m "test(kanban): ensure all realtime streaming tests pass"
```
