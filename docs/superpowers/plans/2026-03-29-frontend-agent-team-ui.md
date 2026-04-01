# Frontend Agent Team UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the RushDino frontend to reflect all 7 new backend agent team features: kanban card metadata, agent health/circuit breaker, claim tags, tool scoping, messages page, agent inbox tab, and workflow step types.

**Architecture:** Extend existing React + TypeScript + Tailwind + shadcn/ui frontend. Update type definitions first, then add backend API endpoints, then update existing pages, then add new pages. Each task produces a buildable increment.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui (Radix), lucide-react icons, Vite

---

### Task 1: Update Kanban Types

**Files:**
- Modify: `frontend/src/pages/kanban/kanban-types.ts`

- [ ] **Step 1: Add new fields to KanbanTask type**

In `frontend/src/pages/kanban/kanban-types.ts`, add `revisionCount` and `notifyConversationId` to the `KanbanTask` type (after the existing `completedAt` field, around line 34):

```typescript
  completedAt: string | null;
  revisionCount: number;
  notifyConversationId: string | null;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors (existing code doesn't reference these fields yet)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/kanban/kanban-types.ts
git commit -m "feat(ui): add revisionCount and notifyConversationId to KanbanTask type"
```

---

### Task 2: Add Footer Row to Kanban TaskCard

**Files:**
- Modify: `frontend/src/pages/kanban/KanbanPage.tsx:168-250`

- [ ] **Step 1: Add footer row to TaskCard component**

In `frontend/src/pages/kanban/KanbanPage.tsx`, find the TaskCard component (starts around line 168). After the existing meta footer (depth indicator + relative time, around lines 242-247), add a new footer row before the closing `</div>` of the card:

```tsx
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
```

Insert this block right before the closing `</CardContent>` tag in the TaskCard.

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/kanban/KanbanPage.tsx
git commit -m "feat(ui): add revision count and parent link footer to kanban task cards"
```

---

### Task 3: Extend AgentRecord Type with New Fields

**Files:**
- Modify: `frontend/src/pages/agents/agent-types.ts`

- [ ] **Step 1: Add claimTags, claimsTasks, tools to AgentRecord**

In `frontend/src/pages/agents/agent-types.ts`, extend the `AgentRecord` type (around lines 12-20). Add after `sandboxPolicy`:

```typescript
export type AgentRecord = {
  id: string;
  name: string;
  emoji: string;
  isDefault: boolean;
  workspace: string;
  description: string;
  sandboxPolicy?: SandboxPolicy | null;
  claimTags: string[];
  claimsTasks: boolean;
  tools: string | null;
};
```

- [ ] **Step 2: Add AgentHealth type**

After `AgentRecord`, add:

```typescript
export type AgentHealth = {
  successRate: number;
  totalTasks: number;
  circuitOpen: boolean;
  backoffSeconds: number;
  nextRetryAt: string | null;
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: May have errors where AgentRecord is consumed — fix any destructuring that breaks.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/agents/agent-types.ts
git commit -m "feat(ui): add claimTags, claimsTasks, tools, and AgentHealth types"
```

---

### Task 4: Backend — Extend Agent List API Response

**Files:**
- Modify: `crates/server/src/routes/agents.rs:13-24`

- [ ] **Step 1: Add fields to AgentListItem**

In `crates/server/src/routes/agents.rs`, add to the `AgentListItem` struct (after `sandbox_policy`, around line 23):

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentListItem {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub is_default: bool,
    pub workspace: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox_policy: Option<SandboxPolicy>,
    pub claim_tags: Vec<String>,
    pub claims_tasks: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<String>,
}
```

- [ ] **Step 2: Populate new fields in list_agents handler**

In the `list_agents` handler (around lines 117-143), where each agent is mapped to `AgentListItem`, add the new fields from the template:

```rust
AgentListItem {
    // ... existing fields ...
    claim_tags: agent.claim_tags.clone(),
    claims_tasks: agent.claims_tasks,
    tools: agent.tools.clone(),
}
```

- [ ] **Step 3: Build and test**

Run: `cargo build -p rushdino-server && cargo test -p rushdino-server 2>&1 | tail -5`
Expected: Clean compile, tests pass

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/agents.rs
git commit -m "feat(api): expose claimTags, claimsTasks, tools in agent list response"
```

---

### Task 5: Backend — Agent Health API Endpoint

**Files:**
- Modify: `crates/server/src/routes/agents.rs`
- Modify: `crates/server/src/lib.rs`
- Modify: `crates/agent/src/agent_health_store.rs`

- [ ] **Step 1: Add health endpoint handler in agents.rs**

Add the following handler function and response struct at the end of `crates/server/src/routes/agents.rs`:

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHealthResponse {
    pub success_rate: f64,
    pub total_tasks: i64,
    pub circuit_open: bool,
}

pub async fn get_agent_health(
    State(state): State<Arc<RuntimeState>>,
    Path(agent_id): Path<String>,
) -> Result<Json<AgentHealthResponse>, AppError> {
    let health_store = &state.engine.health_store();
    let success_rate = health_store.get_success_rate(&agent_id).await?;
    let circuit_open = health_store.is_circuit_open(&agent_id).await?;
    let total_tasks = health_store.get_total_tasks(&agent_id).await?;

    Ok(Json(AgentHealthResponse {
        success_rate,
        total_tasks,
        circuit_open,
    }))
}

pub async fn reset_agent_health(
    State(state): State<Arc<RuntimeState>>,
    Path(agent_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    state.engine.health_store().reset(&agent_id).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}
```

- [ ] **Step 2: Add get_total_tasks and reset methods to AgentHealthStore**

In `crates/agent/src/agent_health_store.rs`, add:

```rust
    pub async fn get_total_tasks(&self, agent_name: &str) -> Result<i64> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM agent_match_outcomes WHERE agent_name = ?1"
        )
        .bind(agent_name)
        .fetch_one(self.pool.as_ref())
        .await?;
        Ok(row.0)
    }

    pub async fn reset(&self, agent_name: &str) -> Result<()> {
        sqlx::query("DELETE FROM agent_match_outcomes WHERE agent_name = ?1")
            .bind(agent_name)
            .execute(self.pool.as_ref())
            .await?;
        sqlx::query("DELETE FROM agent_health_events WHERE agent_name = ?1")
            .bind(agent_name)
            .execute(self.pool.as_ref())
            .await?;
        Ok(())
    }
```

- [ ] **Step 3: Expose health_store on AgentEngine**

In `crates/agent/src/engine_mgmt.rs`, add an accessor (among the other pub fn accessors):

```rust
    pub fn health_store(&self) -> &crate::agent_health_store::AgentHealthStore {
        &self.health_store
    }
```

Also add `health_store` field to `AgentEngine` struct in `engine.rs` and populate it from `deps.health_store` in the constructor. Check if it already exists — if the field is missing, add `pub(crate) health_store: Arc<crate::agent_health_store::AgentHealthStore>` to the struct and `health_store: deps.health_store.clone()` in the `new()` method.

- [ ] **Step 4: Register routes in lib.rs**

In `crates/server/src/lib.rs`, after the existing agent routes (around line 505), add:

```rust
.route("/api/agents/:id/health", get(routes::agents::get_agent_health))
.route("/api/agents/:id/health/reset", post(routes::agents::reset_agent_health))
```

- [ ] **Step 5: Build and test**

Run: `cargo build && cargo test -p rushdino-agent 2>&1 | tail -5`
Expected: Clean compile, all tests pass

- [ ] **Step 6: Commit**

```bash
git add crates/server/src/routes/agents.rs crates/server/src/lib.rs crates/agent/src/agent_health_store.rs crates/agent/src/engine.rs crates/agent/src/engine_mgmt.rs
git commit -m "feat(api): add agent health and reset endpoints"
```

---

### Task 6: Backend — Messages API Endpoint

**Files:**
- Create: `crates/server/src/routes/messages.rs`
- Modify: `crates/server/src/routes/mod.rs`
- Modify: `crates/server/src/lib.rs`
- Modify: `crates/agent/src/agent_message_store.rs`

- [ ] **Step 1: Add list_all method to AgentMessageStore**

In `crates/agent/src/agent_message_store.rs`, add:

```rust
    pub async fn list_all(&self, limit: i64) -> Result<Vec<AgentMessage>> {
        let rows = sqlx::query(
            "SELECT id, from_agent, to_agent, content, read, created_at \
             FROM agent_messages ORDER BY created_at DESC LIMIT ?1"
        )
        .bind(limit)
        .fetch_all(self.pool.as_ref())
        .await?;

        rows.into_iter()
            .map(|row| {
                Ok(AgentMessage {
                    id: row.try_get("id")?,
                    from_agent: row.try_get("from_agent")?,
                    to_agent: row.try_get("to_agent")?,
                    content: row.try_get("content")?,
                    read: row.try_get::<i32, _>("read")? != 0,
                    created_at: row.try_get("created_at")?,
                })
            })
            .collect()
    }
```

- [ ] **Step 2: Create messages route file**

Create `crates/server/src/routes/messages.rs`:

```rust
use std::sync::Arc;

use axum::{extract::{Query, State}, Json};
use serde::{Deserialize, Serialize};

use rushdino_agent::AgentMessage;
use rushdino_common::AppError;

use crate::state::RuntimeState;

#[derive(Debug, Deserialize)]
pub struct MessagesQuery {
    pub agent: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub unread_only: bool,
}

fn default_limit() -> i64 { 50 }

#[derive(Debug, Serialize)]
pub struct MessagesResponse {
    pub items: Vec<AgentMessage>,
}

pub async fn list_messages(
    State(state): State<Arc<RuntimeState>>,
    Query(query): Query<MessagesQuery>,
) -> Result<Json<MessagesResponse>, AppError> {
    let store = state.engine.message_store();
    let items = if let Some(agent) = &query.agent {
        store.inbox(agent, query.unread_only).await?
    } else {
        store.list_all(query.limit).await?
    };
    Ok(Json(MessagesResponse { items }))
}
```

- [ ] **Step 3: Expose message_store on AgentEngine**

In `crates/agent/src/engine_mgmt.rs`, add accessor:

```rust
    pub fn message_store(&self) -> &crate::agent_message_store::AgentMessageStore {
        &self.message_store
    }
```

Add `pub(crate) message_store: Arc<crate::agent_message_store::AgentMessageStore>` to the AgentEngine struct and `message_store: deps.message_store.clone()` in the constructor (if not already present).

- [ ] **Step 4: Register route**

In `crates/server/src/routes/mod.rs`, add: `pub mod messages;`

In `crates/server/src/lib.rs`, after kanban routes (around line 537), add:

```rust
.route("/api/messages", get(routes::messages::list_messages))
```

- [ ] **Step 5: Build and test**

Run: `cargo build && cargo test 2>&1 | grep "test result"`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add crates/server/src/routes/messages.rs crates/server/src/routes/mod.rs crates/server/src/lib.rs crates/agent/src/agent_message_store.rs crates/agent/src/engine.rs crates/agent/src/engine_mgmt.rs
git commit -m "feat(api): add messages list endpoint for inter-agent messaging"
```

---

### Task 7: Frontend — API Functions for Health and Messages

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add health and message API functions**

In `frontend/src/lib/api.ts`, after the existing agent fetch functions (around line 218), add:

```typescript
export async function fetchAgentHealth(agentId: string): Promise<AgentHealth> {
  const res = await fetch(`/api/agents/${agentId}/health`);
  return parseJsonOrThrow(res, `agents/${agentId}/health`);
}

export async function resetAgentHealth(agentId: string): Promise<void> {
  const res = await fetch(`/api/agents/${agentId}/health/reset`, { method: 'POST' });
  await parseJsonOrThrow(res, `agents/${agentId}/health/reset`);
}

export type AgentMessageRecord = {
  id: string;
  fromAgent: string;
  toAgent: string;
  content: string;
  read: boolean;
  createdAt: string;
};

export async function fetchMessages(params?: {
  agent?: string;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<AgentMessageRecord[]> {
  const searchParams = new URLSearchParams();
  if (params?.agent) searchParams.set('agent', params.agent);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.unreadOnly) searchParams.set('unread_only', 'true');
  const qs = searchParams.toString();
  const res = await fetch(`/api/messages${qs ? `?${qs}` : ''}`);
  const data = await parseJsonOrThrow(res, 'messages');
  return data.items;
}
```

Add the import for `AgentHealth` at the top of the file (from agent-types):

```typescript
import type { AgentHealth } from '@/pages/agents/agent-types';
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(ui): add API functions for agent health and messages"
```

---

### Task 8: Rebuild Agent Board Page as Team Status Dashboard

**Files:**
- Modify: `frontend/src/pages/agent-board/AgentBoardPage.tsx`
- Create: `frontend/src/pages/agent-board/agent-health-indicator.tsx`
- Create: `frontend/src/pages/agent-board/use-agent-health.ts`

- [ ] **Step 1: Create health data hook**

Create `frontend/src/pages/agent-board/use-agent-health.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { fetchAgentHealth, resetAgentHealth } from '@/lib/api';
import type { AgentHealth } from '@/pages/agents/agent-types';

export function useAgentHealth(agentIds: string[], enabled: boolean) {
  const [healthMap, setHealthMap] = useState<Record<string, AgentHealth>>({});

  const load = useCallback(async () => {
    const results: Record<string, AgentHealth> = {};
    await Promise.allSettled(
      agentIds.map(async (id) => {
        try {
          results[id] = await fetchAgentHealth(id);
        } catch {
          // Agent may not have health data yet — ignore
        }
      }),
    );
    setHealthMap(results);
  }, [agentIds]);

  useEffect(() => {
    if (!enabled || agentIds.length === 0) return;
    load();
    const interval = setInterval(load, 10_000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [enabled, load, agentIds]);

  const reset = useCallback(async (agentId: string) => {
    await resetAgentHealth(agentId);
    await load();
  }, [load]);

  return { healthMap, reset };
}
```

- [ ] **Step 2: Create health indicator component**

Create `frontend/src/pages/agent-board/agent-health-indicator.tsx`:

```typescript
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import type { AgentHealth } from '@/pages/agents/agent-types';

function healthColor(rate: number): string {
  if (rate >= 0.7) return 'bg-green-500';
  if (rate >= 0.4) return 'bg-yellow-500';
  return 'bg-red-500';
}

function healthTextColor(rate: number): string {
  if (rate >= 0.7) return 'text-green-400';
  if (rate >= 0.4) return 'text-yellow-400';
  return 'text-red-400';
}

export function AgentHealthIndicator({
  health,
  onReset,
}: {
  health: AgentHealth | undefined;
  onReset: () => void;
}) {
  if (!health || health.totalTasks === 0) {
    return (
      <div className="px-2 py-1.5 bg-background/50 rounded">
        <div className="flex items-center justify-between text-[8px] text-muted-foreground tracking-widest uppercase">
          <span>Health</span>
          <span>No data</span>
        </div>
      </div>
    );
  }

  const pct = Math.round(health.successRate * 100);

  return (
    <div className="space-y-1.5">
      <div className="px-2 py-1.5 bg-background/50 rounded">
        <div className="flex items-center justify-between text-[8px] tracking-widest uppercase mb-1">
          <span className="text-muted-foreground">Health</span>
          <span className={healthTextColor(health.successRate)}>
            {pct}% ({health.totalTasks} tasks)
          </span>
        </div>
        <div className="h-[3px] bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${healthColor(health.successRate)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {health.circuitOpen && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 bg-red-950 border border-red-900 rounded">
          <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-semibold text-red-400">CIRCUIT BREAKER OPEN</div>
            <div className="text-[8px] text-red-400/70">
              Success rate {pct}% — excluded from auto-dispatch
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[8px] text-red-400 hover:text-red-300 hover:bg-red-900/50"
            onClick={(e) => { e.stopPropagation(); onReset(); }}
          >
            Reset
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rebuild AgentBoardPage with team status + health**

Rewrite `frontend/src/pages/agent-board/AgentBoardPage.tsx` to include health, claim tags, tools, and team activity. This is a full rewrite of the page — read the current file first, then replace it with the new version that:

1. Keeps the existing column grouping (Active/Recent/Idle/Blocked)
2. Uses the existing `useAgentProgressBoard` hook
3. Adds `useAgentHealth` hook for health data
4. Adds `useKanbanBoard` hook for team activity stats
5. Renders expanded agent cards with: health indicator, claim tags, tools list
6. Adds a team activity summary bar at the top

The agent card should show:
- Header: emoji + name + ID + status badge
- Health indicator component (from step 2)
- "ROUTES TO" section with claim tag pills (first 5, +N overflow)
- "TOOLS" section with tool count and names
- Activity counters: Now / Recent / Blocked

Add a team activity summary bar above the columns:
- Backlog count, Active count, In Review count, Recently Done count
- Data from `useKanbanBoard` stats

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/agent-board/
git commit -m "feat(ui): rebuild agent board as team status dashboard with health, tags, tools"
```

---

### Task 9: Add Messages Nav Item and Page

**Files:**
- Modify: `frontend/src/lib/navigation.ts`
- Create: `frontend/src/pages/messages/MessagesPage.tsx`
- Create: `frontend/src/pages/messages/use-messages.ts`
- Modify: Router file (find where routes are defined)

- [ ] **Step 1: Add Messages to navigation**

In `frontend/src/lib/navigation.ts`, add `Mail` to the lucide-react import:

```typescript
import { ..., Mail, ... } from 'lucide-react';
```

Add Messages item to the operations group, after Task Board (around line 47):

```typescript
{ id: 'messages', label: 'Messages', icon: Mail, href: '/messages', matchPrefix: '/messages', advancedOnly: true },
```

- [ ] **Step 2: Create messages data hook**

Create `frontend/src/pages/messages/use-messages.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { fetchMessages, type AgentMessageRecord } from '@/lib/api';

const POLL_INTERVAL_MS = 5000;

export function useMessages(enabled: boolean, agent?: string) {
  const [messages, setMessages] = useState<AgentMessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const items = await fetchMessages({ agent, limit: 50 });
      setMessages(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  }, [agent]);

  useEffect(() => {
    if (!enabled) return;
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, load]);

  return { messages, loading, error, refresh: load };
}
```

- [ ] **Step 3: Create MessagesPage**

Create `frontend/src/pages/messages/MessagesPage.tsx`:

```typescript
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';
import { useMessages } from './use-messages';

export function MessagesPage() {
  const { messages, loading, error, refresh } = useMessages(true);

  const unreadCount = messages.filter((m) => !m.read).length;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-[13px] font-semibold tracking-wide">Agent Messages</h1>
          {unreadCount > 0 && (
            <Badge variant="info" className="text-[8px]">{unreadCount} unread</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} className="h-6 px-2 text-[9px]">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {loading && messages.length === 0 && (
        <p className="text-[10px] text-muted-foreground">Loading messages...</p>
      )}

      {error && (
        <p className="text-[10px] text-destructive">{error}</p>
      )}

      {!loading && messages.length === 0 && (
        <p className="text-[10px] text-muted-foreground">No messages yet. Agents will send messages to each other during task execution.</p>
      )}

      <div className="flex flex-col gap-2">
        {messages.map((msg) => (
          <Card key={msg.id} className={`${msg.read ? 'opacity-60' : ''}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="font-semibold">{msg.fromAgent}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-semibold">{msg.toAgent}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {!msg.read && <Badge variant="info" className="text-[7px] px-1">NEW</Badge>}
                  <span className="text-[8px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground leading-relaxed">{msg.content}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
```

- [ ] **Step 4: Register route**

Find the router file (likely `frontend/src/App.tsx` or `frontend/src/routes.tsx`) and add:

```tsx
import { MessagesPage } from '@/pages/messages/MessagesPage';

// Add to routes:
<Route path="/messages" element={<MessagesPage />} />
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/navigation.ts frontend/src/pages/messages/ frontend/src/App.tsx
git commit -m "feat(ui): add Messages page with inter-agent message feed"
```

---

### Task 10: Add Messages Tab to Agent Focus Page

**Files:**
- Modify: `frontend/src/pages/agents/AgentFocusPage.tsx`
- Modify: `frontend/src/pages/agents/agent-types.ts`

- [ ] **Step 1: Add 'messages' to AgentPanel type**

In `frontend/src/pages/agents/agent-types.ts`, extend the `AgentPanel` union (around line 3):

```typescript
export type AgentPanel = 'overview' | 'progress' | 'files' | 'tools' | 'skills' | 'channels' | 'cron' | 'messages';
```

- [ ] **Step 2: Add Messages tab to AgentFocusPage**

In `frontend/src/pages/agents/AgentFocusPage.tsx`, import `useMessages` and add a Messages tab. In the tab bar, add a "Messages" button. When active, render a filtered message list for the current agent using `useMessages(true, agent.id)`.

The messages list should reuse the same card format from `MessagesPage.tsx` — import the relevant JSX or extract a shared `MessageCard` component.

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/agents/
git commit -m "feat(ui): add Messages tab to agent focus page"
```

---

### Task 11: Update Agent Properties Panel with Claim Tags and Tools

**Files:**
- Modify: `frontend/src/pages/agents/agent-overview-properties-panel.tsx`

- [ ] **Step 1: Add claim tags and tools to PropertiesSection**

In `frontend/src/pages/agents/agent-overview-properties-panel.tsx`, find the `PropertiesSection` component (around line 382). After the existing properties (ID, Version, Latency, etc.), add:

```tsx
{/* Claim Tags */}
{agent.claimTags && agent.claimTags.length > 0 && (
  <div className="space-y-1">
    <div className="text-[8px] text-muted-foreground tracking-widest uppercase">Routes To</div>
    <div className="flex flex-wrap gap-1">
      {agent.claimTags.slice(0, 6).map((tag) => (
        <Badge key={tag} variant="secondary" className="text-[8px] px-1.5 py-0">
          {tag}
        </Badge>
      ))}
      {agent.claimTags.length > 6 && (
        <span className="text-[8px] text-muted-foreground">+{agent.claimTags.length - 6}</span>
      )}
    </div>
  </div>
)}

{/* Tool Scoping */}
{agent.tools && (
  <div className="space-y-1">
    <div className="text-[8px] text-muted-foreground tracking-widest uppercase">
      Tools ({agent.tools.split(',').length})
    </div>
    <p className="text-[8px] text-muted-foreground/70 leading-relaxed">
      {agent.tools}
    </p>
  </div>
)}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/agents/agent-overview-properties-panel.tsx
git commit -m "feat(ui): show claim tags and tool scoping in agent properties panel"
```

---

### Note: Workflow Step Types

The spec calls for step type badges (agent/script/transform) in workflow views. However, no workflow pages exist in the frontend yet (`frontend/src/pages/` has no workflow directory). The `StepType` enum and backend serialization are already in place — when a workflow UI is built, it should read `stepType` from the API response and show the appropriate badge. This is deferred, not forgotten.

---

### Task 12: Final Integration Test

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Full backend build and test**

Run: `cargo build && cargo test 2>&1 | grep "test result"`
Expected: All tests pass

- [ ] **Step 3: Dev server smoke test**

Run: `cd frontend && npm run dev` (in background)

Open browser and verify:
1. `/kanban` — task cards show revision count footer when applicable
2. `/agent-board` — agents show health bar, claim tags, tools, circuit breaker alert
3. `/messages` — messages page loads (empty is fine if no messages exist)
4. `/agents/:id` — Messages tab appears, properties panel shows claim tags and tools

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(ui): complete frontend agent team architecture UI updates"
```
