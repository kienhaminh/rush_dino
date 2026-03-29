# Frontend: Agent Team Architecture UI

**Date**: 2026-03-29
**Status**: Draft
**Context**: The backend multi-agent architecture was refactored with 11 improvements (claim_tags, tool scoping, health/circuit breaker, task-chain context, feedback loop, team status, agent messaging, workflow step types, event-driven dispatch). The frontend needs to reflect all 7 user-facing features.

---

## 1. Kanban Task Cards — Footer Row Metadata

**Page**: `/kanban` (`KanbanPage.tsx`)

Add a footer row below the existing agent assignee line on each task card. The footer is a border-top-separated row showing:

- **Revision count** (purple text): `↻ 2 revisions` — shown only when `revisionCount > 0`
- **Step type** (cyan text): `step: script` or `step: transform` — shown only when not `agent` (the default)
- **Parent task link** (muted text): `↗ parent: Deploy v2` — shown only when `parentTaskId` is set, displays parent task's title (truncated)

**Type changes** (`kanban-types.ts`):
```typescript
type KanbanTask = {
  // ... existing fields ...
  revisionCount: number;              // NEW
  notifyConversationId: string | null; // NEW
};
```

**Backend**: The `/api/kanban/board` endpoint already serializes all `KanbanTask` fields from the Rust struct including `revision_count` and `notify_conversation_id`. The frontend just needs to consume them.

---

## 2. Agent Board — Rebuilt as Team Status Dashboard

**Page**: `/agent-board` (`AgentBoardPage.tsx`) — replace current implementation

### Agent Cards (Design C — Full Detail Panel)

Each agent card displays:

1. **Header**: Emoji + name + agent ID + status badge (Active/Recent/Idle/Blocked)
2. **Health section**: Dark inset panel with:
   - Label "HEALTH" + percentage + task window count
   - Thin progress bar (green >70%, yellow 40-70%, red <40%)
   - Circuit breaker alert when open: red banner with warning icon, "CIRCUIT BREAKER OPEN", success rate, exponential backoff countdown ("retrying in 3m 42s"), and "Reset Health" button
3. **Claim tags section**: Label "ROUTES TO" + tag pills (show first 5, "+N" overflow)
4. **Tools section**: Label "TOOLS (N)" + comma-separated tool names in muted text
5. **Activity counters**: Now / Recent / Blocked counts (existing)

### Team Activity Section

Above or below the agent cards grid, add a summary bar:

- **Backlog**: N tasks waiting
- **Active**: N tasks being worked on
- **In Review**: N tasks awaiting review
- **Recently Done**: N (last hour)

This data comes from the existing `/api/kanban/board` stats endpoint — no new backend needed.

### Health Data — New Backend Endpoint

```
GET /api/agents/:id/health
Response:
{
  "successRate": 0.85,
  "totalTasks": 10,
  "circuitOpen": false,
  "backoffSeconds": 0,
  "nextRetryAt": null
}

POST /api/agents/:id/health/reset
Response: { "success": true }
```

**Backend implementation**: New route in `crates/server/src/routes/agents.rs` that calls `AgentHealthStore::get_success_rate()` and `is_circuit_open()`. The reset endpoint clears `agent_match_outcomes` for that agent.

**Exponential backoff state**: Add `backoff_level: u32` and `circuit_opened_at: Option<String>` fields to `agent_health_events` table. The health endpoint computes `nextRetryAt` from `circuit_opened_at + 2^backoff_level minutes` (capped at 15 min). Backend changes needed in `AgentHealthStore` to track backoff state.

### Type Changes

```typescript
// New type
type AgentHealth = {
  successRate: number;
  totalTasks: number;
  circuitOpen: boolean;
  backoffSeconds: number;
  nextRetryAt: string | null;
};

// Extend AgentRecord
type AgentRecord = {
  // ... existing fields ...
  claimTags: string[];     // NEW
  claimsTasks: boolean;    // NEW
  tools: string | null;    // NEW — comma-separated tool names
};
```

**Backend**: Update the `GET /api/agents` list endpoint in `crates/server/src/routes/agents.rs` to include `claim_tags`, `claims_tasks`, and `tools` from `AgentTemplate`.

---

## 3. Agent Focus Page — Messages Tab

**Page**: `/agents/:id` (`AgentFocusPage.tsx`)

Add a "Messages" tab alongside existing tabs (overview, progress, files, tools, skills, channels, cron).

### Messages Tab Content

- List of messages to/from this agent, ordered by `created_at` DESC
- Each message shows: from agent emoji+name, to agent emoji+name, content, timestamp, read/unread badge
- Unread count badge on the tab label: "Messages (3)"
- Auto-refresh with 5-second polling (matches kanban board pattern)

### Agent Properties Panel Update

In the existing properties sidebar (`agent-overview-properties-panel.tsx`):

- Add "ROUTES TO" section showing claim_tags as pills (same as board card)
- Add "TOOLS" section showing scoped tool count and names

---

## 4. Messages Page — New Page

**Page**: `/messages` (new nav item)

### Layout

- **Header**: "Agent Messages" title + unread count badge + refresh button
- **Message list**: All messages across all agents, newest first
- **Each row**: From agent (emoji+name) → To agent (emoji+name), content preview (truncated), timestamp, read/unread dot
- **Filter**: Dropdown to filter by agent name
- **Polling**: 5-second refresh interval

### Navigation

Add "Messages" to the main sidebar navigation, between existing items. Use the `MessageSquare` lucide icon. Show unread badge count on the nav item.

### Backend Endpoints

```
GET /api/messages?agent=<name>&unread_only=<bool>&limit=<n>
Response:
{
  "items": [
    {
      "id": "msg-123",
      "fromAgent": "researcher",
      "toAgent": "writer",
      "content": "Found 5 relevant papers on async Rust...",
      "read": false,
      "createdAt": "2026-03-29T12:00:00Z"
    }
  ]
}
```

**Backend implementation**: New route in `crates/server/src/routes/` (new file `messages.rs`) that calls `AgentMessageStore::inbox()` or a new `list_all()` method.

---

## 5. Workflow Step Types — Visual Indicator

**Affected pages**: Any workflow run detail view

When displaying workflow steps (in workflow run detail or workflow editor):

- Show step type badge next to step name:
  - `agent` — no badge (default, implicit)
  - `script` — cyan badge: "⚡ script"
  - `transform` — yellow badge: "⚙ transform"

### Type Changes

```typescript
type StepType = 'agent' | 'script' | 'transform';

// Update existing workflow step type
type WorkflowStep = {
  // ... existing fields ...
  stepType: StepType; // NEW
};
```

---

## 6. Backend Changes Summary

| Endpoint | Method | File | Purpose |
|----------|--------|------|---------|
| `/api/agents` | GET | `routes/agents.rs` | Add `claimTags`, `claimsTasks`, `tools` to response |
| `/api/agents/:id/health` | GET | `routes/agents.rs` | New — health metrics + circuit breaker state |
| `/api/agents/:id/health/reset` | POST | `routes/agents.rs` | New — clear health history |
| `/api/messages` | GET | `routes/messages.rs` (new) | New — list inter-agent messages |

Backend store changes:
- `AgentHealthStore`: Add `backoff_level`, `circuit_opened_at` tracking for exponential backoff
- `AgentMessageStore`: Add `list_all()` method for the messages page
- DB migration (`011_circuit_breaker_backoff.sql`): New `agent_circuit_state` table with `agent_name TEXT PRIMARY KEY`, `backoff_level INTEGER NOT NULL DEFAULT 0`, `circuit_opened_at TEXT`, `updated_at TEXT`. Separate table because this is mutable per-agent state, not an append-only event log.

---

## 7. File Impact Summary

### Frontend — Modified

| File | Changes |
|------|---------|
| `pages/kanban/kanban-types.ts` | Add `revisionCount`, `notifyConversationId` |
| `pages/kanban/KanbanPage.tsx` | Add footer row to TaskCard |
| `pages/agents/agent-types.ts` | Add `AgentHealth`, extend `AgentRecord` |
| `pages/agent-board/AgentBoardPage.tsx` | Rebuild with health, tags, tools, team activity |
| `pages/agents/AgentFocusPage.tsx` | Add Messages tab |
| `pages/agents/agent-overview-properties-panel.tsx` | Add claim_tags and tools sections |
| `lib/api.ts` | Add health, messages, extended agent fetch functions |
| Sidebar/navigation component | Add Messages nav item |

### Frontend — New Files

| File | Purpose |
|------|---------|
| `pages/messages/MessagesPage.tsx` | Agent messages page |
| `pages/messages/message-types.ts` | Message type definitions |
| `pages/messages/use-messages.ts` | Messages data hook |
| `pages/agent-board/agent-health-indicator.tsx` | Health bar + circuit breaker component |
| `pages/agent-board/use-agent-health.ts` | Health data hook |

### Backend — Modified

| File | Changes |
|------|---------|
| `crates/server/src/routes/agents.rs` | Add health endpoint, extend agent list response |
| `crates/agent/src/agent_health_store.rs` | Add backoff tracking |

### Backend — New Files

| File | Purpose |
|------|---------|
| `crates/server/src/routes/messages.rs` | Messages API endpoint |
| `crates/common/migrations/011_circuit_breaker_backoff.sql` | Backoff state columns |

---

## 8. Verification

- `cargo test` — all backend tests pass after endpoint additions
- `npm run check:types` — TypeScript compiles with new types
- Manual: open `/agent-board`, verify health bars and claim tags render
- Manual: open `/kanban`, verify footer row shows on tasks with revisions
- Manual: open `/messages`, verify messages list and filtering
- Manual: trigger circuit breaker (fail 6+ tasks), verify alert + backoff timer + reset button
