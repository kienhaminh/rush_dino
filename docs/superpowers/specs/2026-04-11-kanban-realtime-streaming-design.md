# Kanban Real-Time Event Streaming — Design Spec

**Date:** 2026-04-11  
**Status:** Approved

---

## Overview

Replace the Kanban board's 3-second polling with WebSocket-driven real-time updates. Every tool call, status change, and grading event emitted by a running agent streams directly into the task card. Users can see exactly what the agent is doing, watch self-correction scores update in place, and manage multiple parallel sessions via a tab strip above the board.

---

## Goals

1. **Immediate feedback** — tool calls appear in the task card as they happen, not on the next poll cycle.
2. **Transparent self-correction** — score changes (e.g. 62 → 96) are visible in the card footer as the agent iterates.
3. **Parallel session awareness** — a tab strip above the board shows all actively running agent sessions.

---

## Architecture

```
Rust Agent Layer
  └─ KanbanStore mutations (claim, update_status, grade, complete)
       └─ emit WsTaskEvent → GatewayRouter → WebSocket clients

Frontend
  └─ use-chat-ws.tsx  (existing WebSocket hook)
       └─ handles WsTaskEvent → writes to kanban Zustand store
            └─ KanbanPage reads store → renders cards + session tabs
```

All events flow through the **existing WebSocket connection**. No new HTTP endpoints or SSE connections are added. Polling is kept as a fallback at a reduced frequency.

---

## WebSocket Event Types

Three new event types are added to the existing protocol:

| Event | Payload | When emitted |
|---|---|---|
| `task_status_changed` | `{ task_id, title, old_status, new_status, agent_name }` | Task moves between columns |
| `task_tool_event` | `{ task_id, tool_name, status: "start"\|"end", label }` | Each tool call start/end within an agent run |
| `task_graded` | `{ task_id, old_score, new_score, iteration }` | Rubric evaluation completes |

`label` is a short human-readable string: `"Read layout.css"`, `"Bash: bundle check"`, `"Edit variables.css"`.

---

## Backend Changes (Rust)

### 1. New event structs

Add to the existing WebSocket types (follow the pattern of `WsTaskReviewReadyEvent`):

```rust
WsTaskStatusChangedEvent { task_id: String, title: String, old_status: TaskStatus, new_status: TaskStatus, agent_name: String }
WsTaskToolEvent          { task_id: String, tool_name: String, status: String, label: String }
WsTaskGradedEvent        { task_id: String, old_score: u8, new_score: u8, iteration: u8 }
```

### 2. Emit from KanbanStore

After each mutation in `kanban_store.rs`, emit to the gateway broadcast channel:

- `claim_task()` → emit `task_status_changed` (Backlog → Claimed or Claimed → InProgress)
- `update_task_status()` → emit `task_status_changed`
- Tool call start/end in the agent runner → emit `task_tool_event`
- Rubric evaluation → emit `task_graded`

The `GatewayRouter` already has a broadcast channel used by `task_review_ready`. Use the same pattern.

### 3. Tool events

`runtime_run_events` is already written per tool call in the DB. The agent runner emits a `WsTaskToolEvent` alongside the existing DB write — no schema changes needed.

---

## Frontend Changes

### 1. WebSocket event handlers (`use-chat-ws.tsx`)

Add three new case handlers:

```typescript
case 'task_status_changed': // move task between column buckets in store
case 'task_tool_event':     // append to per-task event buffer
case 'task_graded':         // update score fields on task
```

### 2. Kanban Zustand store (new or extended)

Add to the kanban client state:

```typescript
toolEvents: Map<taskId, ToolEvent[]>  // capped at 50 per task
taskScores: Map<taskId, { prev: number, current: number, iteration: number }>
```

`ToolEvent`:
```typescript
{ tool_name: string, label: string, status: 'start' | 'end', timestamp: number }
```

### 3. Task card UI

The inline event feed appears when a task has `status === 'InProgress'` and `toolEvents.length > 0`.

**Feed section:**
- Header: `⬤ Live · {count} events` (pulse dot, event count)
- Shows the **last 4 events** only; top fades with a CSS gradient to imply history
- Each event line: `{icon} {label}` — icon is `✓` (done, green), `⟳` (running, amber), or `✗` (error, red)
- Feed section is absent on cards not in InProgress

**Score footer:**
- Appears when `taskScores` has an entry for this task
- Layout: `iter {n}/{max}` on the left · score pill `prev → current` on the right
- Score pill: dark green background, previous score struck through, current score bold green
- Updates in place as `task_graded` events arrive

### 4. Session tab strip (new component)

Positioned above the board columns, below the stats bar.

- Renders one tab per task with `status === 'InProgress'`
- Tab content: `● {agent_name} · {title (truncated to 24 chars)}`
- Pulse dot color: green (running), amber (grading), grey (disconnected)
- Clicking a tab scrolls the In Progress column into view and briefly highlights the target card (CSS ring flash, 1.5s)
- `+ New session` tab at the end (opens existing new-session flow)
- Tab strip is hidden when no tasks are InProgress

### 5. Polling fallback

| Condition | Poll interval |
|---|---|
| WebSocket connected | 30s (heartbeat only) |
| WebSocket disconnected | 3s (existing behavior) |
| Reconnecting | 3s until reconnected, then back to 30s |

`refetchInterval` in `useKanbanBoardQuery` becomes dynamic based on WebSocket connection state.

---

## Files to Create or Modify

**Backend (Rust):**
- `crates/common/src/types/websocket.rs` — add 3 new event structs
- `crates/agent/src/kanban_store.rs` — emit events after status mutations
- `crates/agent/src/react_loop.rs` or `engine_assistant_runs.rs` — emit `task_tool_event` at tool call start/end alongside existing DB write

**Frontend:**
- `frontend/src/lib/types/websocket.ts` — add 3 new event type definitions
- `frontend/src/hooks/use-chat-ws.tsx` — add 3 new event handlers
- `frontend/src/pages/kanban/KanbanPage.tsx` — integrate real-time state, render feed + score footer
- `frontend/src/pages/kanban/session-tab-strip.tsx` — new component
- `frontend/src/pages/kanban/use-kanban-board.ts` — extend to consume WebSocket state + dynamic poll interval
- `frontend/src/pages/kanban/kanban-realtime-store.ts` — new Zustand store for tool events and scores
- `frontend/src/lib/queries/misc.ts` — make `refetchInterval` dynamic based on WebSocket state

---

## Out of Scope

- Event history persistence beyond the current session (no DB changes for event log)
- Filtering or searching the event feed
- Per-event expandable detail (output snippets, timing) — minimal style only
- WebSocket authentication changes
