# Kanban Real-Time Event Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 3-second polling on the Kanban board with WebSocket-driven real-time updates — streaming tool calls, status changes, and score updates directly into task cards.

**Architecture:** Events flow through the existing `tokio::sync::broadcast::Sender<serde_json::Value>` in `ChatBroadcastHub`. The `KanbanDispatcher` already holds `broadcast_tx` and is the right place to emit all three new event types. The frontend adds a Zustand store for real-time state and three new WebSocket event handlers in `use-chat-ws.tsx`.

**Tech Stack:** Rust (tokio broadcast, serde_json), TypeScript, React, Zustand, React Query, Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/lib/types/websocket.ts` | Modify | Add 3 new event types to union + interfaces |
| `frontend/src/pages/kanban/kanban-realtime-store.ts` | Create | Zustand store for tool events and scores |
| `frontend/src/hooks/use-chat-ws.tsx` | Modify | Handle 3 new WS event types → write to store |
| `frontend/src/lib/queries/misc.ts` | Modify | Dynamic `refetchInterval` based on WS connection |
| `frontend/src/pages/kanban/session-tab-strip.tsx` | Create | Tab strip showing active InProgress tasks |
| `frontend/src/pages/kanban/KanbanPage.tsx` | Modify | Add feed + score footer to TaskCard; wire tab strip |
| `crates/agent/src/kanban_dispatcher.rs` | Modify | Emit 3 new WS events after mutations and tool calls |

---

## Task 1: Add TypeScript WebSocket Event Types

**Files:**
- Modify: `frontend/src/lib/types/websocket.ts`

- [ ] **Step 1: Add the three new event type strings to `WsEventType`**

Open `frontend/src/lib/types/websocket.ts`. Find the `WsEventType` union. Add three new literals:

```typescript
export type WsEventType =
  | 'chat_chunk'
  | 'assistant_reset'
  | 'assistant_message'
  | 'tool_start'
  | 'tool_end'
  | 'approval_request'
  | 'approval_result'
  | 'input_request'
  | 'user_message'
  | 'runtime_log_error'
  | 'task_review_ready'
  | 'task_status_changed'   // ← new
  | 'task_tool_event'       // ← new
  | 'task_graded'           // ← new
  | 'pairing_request_created'
  | 'session_reset'
  | 'error';
```

- [ ] **Step 2: Add the three new event interfaces**

After the `WsTaskReviewReadyEvent` interface, add:

```typescript
export interface WsTaskStatusChangedEvent {
  type: 'task_status_changed';
  task_id: string;
  title: string;
  old_status: string;
  new_status: string;
  agent_name: string;
}

export interface WsTaskToolEvent {
  type: 'task_tool_event';
  task_id: string;
  tool_name: string;
  /** "start" or "end" */
  status: 'start' | 'end';
  /** Human-readable label, e.g. "Read layout.css" */
  label: string;
}

export interface WsTaskGradedEvent {
  type: 'task_graded';
  task_id: string;
  old_score: number;
  new_score: number;
  iteration: number;
}
```

- [ ] **Step 3: Add to the `WsEvent` union**

Find the `WsEvent` type alias and add the three new variants:

```typescript
export type WsEvent =
  | WsChatChunkEvent
  // ... (keep all existing variants) ...
  | WsTaskReviewReadyEvent
  | WsTaskStatusChangedEvent   // ← new
  | WsTaskToolEvent            // ← new
  | WsTaskGradedEvent          // ← new
  | WsPairingRequestCreatedEvent
  // ...
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors related to the new types.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types/websocket.ts
git commit -m "feat(ws): add task_status_changed, task_tool_event, task_graded event types"
```

---

## Task 2: Create Kanban Realtime Zustand Store

**Files:**
- Create: `frontend/src/pages/kanban/kanban-realtime-store.ts`

- [ ] **Step 1: Install zustand if not already present**

```bash
cd frontend && grep '"zustand"' package.json
```

If not present: `npm install zustand`. If already present, skip.

- [ ] **Step 2: Create the store file**

Create `frontend/src/pages/kanban/kanban-realtime-store.ts`:

```typescript
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
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/kanban/kanban-realtime-store.ts
git commit -m "feat(kanban): add realtime Zustand store for tool events and scores"
```

---

## Task 3: Add WebSocket Event Handlers

**Files:**
- Modify: `frontend/src/hooks/use-chat-ws.tsx`

- [ ] **Step 1: Import the store and new event types**

At the top of `use-chat-ws.tsx`, add:

```typescript
import { useKanbanRealtimeStore } from '@/pages/kanban/kanban-realtime-store';
import type { WsTaskStatusChangedEvent, WsTaskToolEvent, WsTaskGradedEvent } from '@/lib/types/websocket';
```

- [ ] **Step 2: Get store actions inside the hook**

Inside the `useChatWs` hook body (near the top where other state is declared), add:

```typescript
const appendToolEvent = useKanbanRealtimeStore((s) => s.appendToolEvent);
const updateScore = useKanbanRealtimeStore((s) => s.updateScore);
const clearTask = useKanbanRealtimeStore((s) => s.clearTask);
```

- [ ] **Step 3: Add handlers inside `handleWsMessage`**

Find the `handleWsMessage` function. After the `task_review_ready` handler block, add three new handlers:

```typescript
if (msg.type === 'task_status_changed') {
  const e = msg as WsTaskStatusChangedEvent;
  // When a task moves out of in_progress, clear its realtime state
  if (e.new_status !== 'in_progress') {
    clearTask(e.task_id);
  }
  return;
}

if (msg.type === 'task_tool_event') {
  const e = msg as WsTaskToolEvent;
  appendToolEvent(e.task_id, {
    tool_name: e.tool_name,
    label: e.label,
    status: e.status,
    timestamp: Date.now(),
  });
  return;
}

if (msg.type === 'task_graded') {
  const e = msg as WsTaskGradedEvent;
  updateScore(e.task_id, e.old_score, e.new_score, e.iteration);
  return;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/use-chat-ws.tsx
git commit -m "feat(kanban): handle task_status_changed, task_tool_event, task_graded in WS hook"
```

---

## Task 4: Dynamic Poll Interval

**Files:**
- Modify: `frontend/src/lib/queries/misc.ts`
- Modify: `frontend/src/pages/kanban/use-kanban-board.ts`

- [ ] **Step 1: Update `useKanbanBoardQuery` to accept `isWsConnected`**

In `frontend/src/lib/queries/misc.ts`, update the signature and refetchInterval:

```typescript
export function useKanbanBoardQuery(enabled = true, isWsConnected = false) {
  return useQuery({
    queryKey: miscKeys.kanban(),
    queryFn: fetchKanbanBoard,
    enabled,
    // When WebSocket is connected, poll rarely (heartbeat). When disconnected, poll every 3s.
    refetchInterval: enabled ? (isWsConnected ? 30_000 : 3_000) : false,
  });
}
```

- [ ] **Step 2: Update `useKanbanBoard` to thread through WS connection state**

Update `useKanbanBoard` in `misc.ts`:

```typescript
export function useKanbanBoard(enabled: boolean, isWsConnected = false) {
  const queryClient = useQueryClient();
  const { data: board, isPending: loading, isRefetching: refreshing, error: queryError } =
    useKanbanBoardQuery(enabled, isWsConnected);

  const deleteMutation = useMutation({
    mutationFn: deleteKanbanTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: miscKeys.kanban() }),
  });

  return {
    board: board ?? null,
    loading,
    refreshing,
    error: queryError?.message ?? null,
    refresh: () => void queryClient.invalidateQueries({ queryKey: miscKeys.kanban() }),
    deleteTask: (taskId: string) => deleteMutation.mutateAsync(taskId),
  };
}
```

- [ ] **Step 3: Check `use-chat-ws.tsx` for the exported `isConnected` value**

Run:
```bash
grep -n 'isConnected\|connected\|wsStatus' frontend/src/hooks/use-chat-ws.tsx | head -20
```

Note the exact name of the connection state boolean returned from the hook (likely `isConnected` or `connected`). Use that name in the next step.

- [ ] **Step 4: Pass `isConnected` from `KanbanPage.tsx` into `useKanbanBoard`**

In `frontend/src/pages/kanban/KanbanPage.tsx`, import `useChatWs` and extract the connection flag. Update the `useKanbanBoard` call:

```typescript
// At the top of KanbanPage, import the WS hook
import { useChatWs } from '@/hooks/use-chat-ws';

export function KanbanPage() {
  const { isConnected } = useChatWs();  // use the exact field name from step 3
  const { board, loading, refreshing, error, refresh, deleteTask } = useKanbanBoard(true, isConnected);
  // ... rest unchanged
}
```

> **Note:** If `useChatWs` requires a conversation ID or other args it doesn't normally get from KanbanPage, check the hook's signature. It may expose `isConnected` via a separate context or atom. Adapt accordingly — the goal is a boolean reflecting WS connectivity.

- [ ] **Step 5: Verify TypeScript compiles and board still loads**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/queries/misc.ts frontend/src/pages/kanban/KanbanPage.tsx
git commit -m "feat(kanban): dynamic poll interval — 30s when WS connected, 3s fallback"
```

---

## Task 5: Emit `task_status_changed` from Rust Dispatcher

**Files:**
- Modify: `crates/agent/src/kanban_dispatcher.rs`

- [ ] **Step 1: Find all `store.claim_task()` and `store.update_task_status()` call sites**

```bash
grep -n 'claim_task\|update_task_status' crates/agent/src/kanban_dispatcher.rs
```

Note the line numbers and the variable that holds the returned `KanbanTask`.

- [ ] **Step 2: After `claim_task()`, emit `task_status_changed`**

Find the call to `self.store.claim_task(...)`. After it (where you have the returned task), add:

```rust
let claimed_task = self.store.claim_task(&task_id, &agent_name).await?;

let _ = self.broadcast_tx.send(serde_json::json!({
    "type": "task_status_changed",
    "task_id": claimed_task.id,
    "title": claimed_task.title,
    "old_status": "backlog",
    "new_status": "in_progress",
    "agent_name": claimed_task.assigned_agent.as_deref().unwrap_or(""),
}));
```

> **Note:** If claim moves the task to `claimed` first (not directly to `in_progress`), use `"claimed"` as `new_status`. Check the `claim_task` implementation: look at what `status` value the returned `KanbanTask` has after claiming.

- [ ] **Step 3: After every `update_task_status()`, emit `task_status_changed`**

For each call to `self.store.update_task_status(...)`, capture the old status before the call and emit after:

```rust
// Capture old status before update (you'll have `task` in scope):
let old_status = format!("{:?}", task.status).to_lowercase();

let updated = self.store.update_task_status(&UpdateTaskInput {
    task_id: task.id.clone(),
    status: TaskStatus::Done,
    result: Some(response.content.clone()),
    block_reason: None,
}).await?;

let _ = self.broadcast_tx.send(serde_json::json!({
    "type": "task_status_changed",
    "task_id": updated.id,
    "title": updated.title,
    "old_status": old_status,
    "new_status": format!("{:?}", updated.status).to_lowercase(),
    "agent_name": updated.assigned_agent.as_deref().unwrap_or(""),
}));
```

> **Note:** `TaskStatus` derives `Debug`. `format!("{:?}", TaskStatus::InProgress)` gives `"InProgress"`. Normalize with `.to_lowercase()` to match the frontend's snake_case strings (`"in_progress"`). Alternatively, implement `Display` or `serde` rename on `TaskStatus` — use whichever pattern is already established in the codebase (`grep -n 'impl.*Display.*TaskStatus\|serde.*rename' crates/agent/src/kanban_store.rs`).

- [ ] **Step 4: Build to verify no Rust compile errors**

```bash
cargo build -p agent 2>&1 | grep -E 'error|warning.*unused'
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add crates/agent/src/kanban_dispatcher.rs
git commit -m "feat(kanban): broadcast task_status_changed on claim and status updates"
```

---

## Task 6: Emit `task_tool_event` and `task_graded` from Rust Dispatcher

**Files:**
- Modify: `crates/agent/src/kanban_dispatcher.rs`

- [ ] **Step 1: Find where `run_react_loop` is called in the dispatcher**

```bash
grep -n 'run_react_loop' crates/agent/src/kanban_dispatcher.rs
```

Note the line number and what `event_tx` argument is currently passed (likely `None`).

- [ ] **Step 2: Create a channel and spawn a forwarding task before `run_react_loop`**

Add the channel creation and forwarding task before the `run_react_loop` call:

```rust
use tokio::sync::mpsc;
use crate::react_loop::StreamingEvent;

// Create a channel to intercept streaming events for this task
let (tool_event_tx, mut tool_event_rx) = mpsc::channel::<StreamingEvent>(256);
let broadcast_tx_clone = self.broadcast_tx.clone();
let task_id_for_events = task.id.clone();

// Spawn a task to forward tool start/end events to WebSocket clients
tokio::spawn(async move {
    while let Some(event) = tool_event_rx.recv().await {
        match event {
            StreamingEvent::ToolStart { ref tool_name, ref args } => {
                // Build a short human label from tool name and args
                let label = build_tool_label(tool_name, args);
                let _ = broadcast_tx_clone.send(serde_json::json!({
                    "type": "task_tool_event",
                    "task_id": task_id_for_events,
                    "tool_name": tool_name,
                    "status": "start",
                    "label": label,
                }));
            }
            StreamingEvent::ToolEnd { ref tool_name, .. } => {
                let _ = broadcast_tx_clone.send(serde_json::json!({
                    "type": "task_tool_event",
                    "task_id": task_id_for_events,
                    "tool_name": tool_name,
                    "status": "end",
                    "label": format!("{} done", tool_name),
                }));
            }
            _ => {}
        }
    }
});

// Pass the sender to run_react_loop (replace the existing None or event_tx arg)
let (response, _messages) = run_react_loop(
    provider.clone(),
    registry.clone(),
    session_ctx.clone(),
    messages,
    &config,
    Some(tool_event_tx),  // ← was None before
).await?;
```

- [ ] **Step 3: Add the `build_tool_label` helper function**

Add this private helper in `kanban_dispatcher.rs`:

```rust
/// Build a short human-readable label for a tool call.
fn build_tool_label(tool_name: &str, args: &serde_json::Value) -> String {
    match tool_name {
        "read" | "Read" => {
            let path = args.get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("file");
            // Show only the filename, not the full path
            let filename = std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(path);
            format!("Read {}", filename)
        }
        "edit" | "Edit" => {
            let path = args.get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("file");
            let filename = std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(path);
            format!("Edit {}", filename)
        }
        "write" | "Write" => {
            let path = args.get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("file");
            let filename = std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(path);
            format!("Write {}", filename)
        }
        "bash" | "Bash" => {
            let cmd = args.get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("command");
            // Truncate long commands
            let truncated = if cmd.len() > 40 {
                format!("{}…", &cmd[..40])
            } else {
                cmd.to_string()
            };
            format!("Bash: {}", truncated)
        }
        _ => {
            // Generic: use the tool name
            tool_name.to_string()
        }
    }
}
```

- [ ] **Step 4: Find where rubric/grading evaluation happens and emit `task_graded`**

```bash
grep -n 'grade\|rubric\|score\|eval' crates/agent/src/kanban_dispatcher.rs | head -20
```

If a grading step exists (a separate function call after the react_loop), find the before/after score values and add:

```rust
let old_score: u8 = /* score before grading */;
// ... grading call ...
let new_score: u8 = /* score after grading */;
let iteration: u8 = /* current iteration count */;

let _ = self.broadcast_tx.send(serde_json::json!({
    "type": "task_graded",
    "task_id": task.id,
    "old_score": old_score,
    "new_score": new_score,
    "iteration": iteration,
}));
```

> **Note:** If no explicit rubric scoring exists in the dispatcher, skip this emit for now — `task_graded` is only emitted when scoring actually occurs.

- [ ] **Step 5: Build to verify no Rust compile errors**

```bash
cargo build -p agent 2>&1 | grep -E 'error\[|^error'
```

Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add crates/agent/src/kanban_dispatcher.rs
git commit -m "feat(kanban): broadcast task_tool_event and task_graded via WS"
```

---

## Task 7: Create Session Tab Strip Component

**Files:**
- Create: `frontend/src/pages/kanban/session-tab-strip.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/pages/kanban/session-tab-strip.tsx`:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/kanban/session-tab-strip.tsx
git commit -m "feat(kanban): add SessionTabStrip component for parallel sessions"
```

---

## Task 8: Add Inline Event Feed and Score Footer to TaskCard

**Files:**
- Modify: `frontend/src/pages/kanban/KanbanPage.tsx`

- [ ] **Step 1: Import the realtime store in KanbanPage.tsx**

At the top of `frontend/src/pages/kanban/KanbanPage.tsx`, add:

```typescript
import { useKanbanRealtimeStore, type ToolEvent } from './kanban-realtime-store';
```

- [ ] **Step 2: Add the `TaskEventFeed` sub-component**

Add this component anywhere before `TaskCard` in `KanbanPage.tsx`:

```typescript
function TaskEventFeed({ taskId }: { taskId: string }) {
  const toolEvents = useKanbanRealtimeStore((s) => s.toolEvents[taskId] ?? []);

  if (toolEvents.length === 0) return null;

  // Show only the last 4 events
  const visible = toolEvents.slice(-4);

  return (
    <div className="mt-2 border-t border-border/40 pt-2">
      {/* Header */}
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>Live</span>
        <span className="ml-auto">{toolEvents.length} events</span>
      </div>
      {/* Events — faded top gradient to imply history */}
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
      <span
        className={
          isDone ? 'text-emerald-500' : 'text-amber-400'
        }
      >
        {isDone ? '✓' : '⟳'}
      </span>
      <span className="truncate">{event.label}</span>
    </div>
  );
}
```

- [ ] **Step 3: Add the `ScoreFooter` sub-component**

Add this component in `KanbanPage.tsx`:

```typescript
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
```

- [ ] **Step 4: Mount feed and footer inside `TaskCard`**

Find the `TaskCard` function. Inside the `<article>`, add `TaskEventFeed` and `ScoreFooter` after the existing content (tags, agent line, etc.) but only when `task.status === 'in_progress'`:

```typescript
function TaskCard({
  task,
  onDelete,
}: {
  task: KanbanTask;
  onDelete: (taskId: string) => Promise<void>;
}) {
  const isActive = task.status === 'in_progress';

  return (
    <article
      id={`kanban-card-${task.id}`}  // ← Add this id for tab strip scroll
      className="group relative rounded-md border border-border/50 bg-background p-3 space-y-2 transition-colors hover:border-border"
    >
      {/* ... existing content unchanged ... */}

      {/* Real-time event feed — only while task is running */}
      {isActive && <TaskEventFeed taskId={task.id} />}

      {/* Score footer — only when a grading event has arrived */}
      {isActive && <ScoreFooter taskId={task.id} />}
    </article>
  );
}
```

> **Note:** Do not remove any existing content from `TaskCard`. The feed and footer are additive, rendered only when `status === 'in_progress'`.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/kanban/KanbanPage.tsx
git commit -m "feat(kanban): add inline event feed and score footer to TaskCard"
```

---

## Task 9: Wire SessionTabStrip into KanbanPage

**Files:**
- Modify: `frontend/src/pages/kanban/KanbanPage.tsx`

- [ ] **Step 1: Import SessionTabStrip**

At the top of `KanbanPage.tsx`, add:

```typescript
import { SessionTabStrip } from './session-tab-strip';
```

- [ ] **Step 2: Add `handleTabClick` function to `KanbanPage`**

Inside the `KanbanPage` component body, add the tab click handler:

```typescript
function handleTabClick(taskId: string) {
  const el = document.getElementById(`kanban-card-${taskId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Brief highlight ring
  el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
  setTimeout(() => {
    el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
  }, 1500);
}
```

- [ ] **Step 3: Mount `SessionTabStrip` between stats bar and board columns**

In the `KanbanPage` return JSX, find where `KanbanStatsBar` is rendered and add `SessionTabStrip` immediately after:

```tsx
{/* Stats bar */}
{board ? <KanbanStatsBar stats={board.stats} /> : null}

{/* Session tab strip — shows active agent sessions */}
{board ? (
  <SessionTabStrip
    inProgressTasks={board.columns.inProgress}
    onTabClick={handleTabClick}
  />
) : null}

{/* Board columns */}
{board ? <KanbanBoard columns={board.columns} onDeleteTask={deleteTask} /> : null}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run the dev server and verify the board loads**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173` (or whichever port is configured), navigate to the Kanban board. Verify:
- Board loads and columns render correctly
- Stats bar and (empty) tab strip area render without errors
- No console errors related to the new components

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/kanban/KanbanPage.tsx
git commit -m "feat(kanban): wire SessionTabStrip and tab-click scroll into KanbanPage"
```

---

## Task 10: End-to-End Verification

- [ ] **Step 1: Build the full Rust backend**

```bash
cargo build 2>&1 | grep -E '^error'
```

Expected: clean build, no errors.

- [ ] **Step 2: Build the frontend**

```bash
cd frontend && npm run build 2>&1 | grep -E 'error|Error'
```

Expected: clean build, no TypeScript or bundle errors.

- [ ] **Step 3: Start the app and trigger a kanban task**

Start both backend and frontend in dev mode. Use the existing task creation flow to create a kanban task and assign it to an agent. Verify in the browser:

- [ ] Task moves to "In Progress" column (via `task_status_changed` WS event, not polling)
- [ ] A tab appears in the `SessionTabStrip` above the board
- [ ] Tool call events appear in the card's inline feed as the agent runs
- [ ] Feed shows only the last 4 events; earlier ones fade
- [ ] If a grading/rubric step runs: the score pill appears in the card footer
- [ ] When the task completes: tab disappears from the strip, feed clears
- [ ] Poll interval is 30s while WS is connected (check Network tab in DevTools — no `/api/kanban/board` requests every 3s)
- [ ] Disconnect from WS (disable network briefly or kill backend): poll drops to 3s

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(kanban): real-time event streaming — tool calls, scores, session tabs"
```
