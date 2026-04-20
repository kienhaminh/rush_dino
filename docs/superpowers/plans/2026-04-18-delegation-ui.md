# Specialist Visibility / Delegation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make agent delegation visible — show sub-run timelines inline, surface token costs per delegation, and visualize parallel fan-out.

**Architecture:** Backend adds two lightweight query endpoints (children, usage-summary). Frontend embeds child run events inside the parent timeline using the existing WsStreamEvent infrastructure, with a collapsible sub-timeline component. Fan-out view shows sibling runs from the same parent using a shared status store.

**Tech Stack:** Rust (axum, sqlx), React, TypeScript, Tailwind CSS, React Query

---

## Codebase Facts (verified before writing this plan)

- `runtime_runs` in `crates/common/migrations/001_init.sql` does **not** have a `parent_run_id` column — migration required.
- `usage_metrics` is keyed by `conversation_id` (not `run_id`). Usage-summary queries must join through `runtime_runs.conversation_id`.
- Tool invocation counts are best derived from `runtime_run_events WHERE event_type = 'tool_start'` (one row per tool call). The `tool_logs` table is keyed by `message_id`, not `run_id`.
- `WsDelegateEvent` (`delegate_event` type) already exists in `frontend/src/lib/types/websocket.ts` and carries `delegate_conversation_id`, `agent_name`, `delegation_depth`, and `inner: WsEvent`.
- The existing `DelegateBlock` component (`frontend/src/components/workspace/delegate-block.tsx`) renders delegation rows inside `ConversationTimeline` — this is where Task 6 attaches the new components.
- Run routes live in `crates/server/src/routes/runs.rs`; they are registered in `crates/server/src/lib.rs`.
- `AgentEngine` exposes runs through `.runtime` (`AgentRuntime`) → `RunStore`; the store is accessed via `state.engine()?` in route handlers.

---

## Task 1: Add `parent_run_id` column via migration

**Files:**
- Read: `crates/common/migrations/001_init.sql` (confirm column is absent)
- Create: `crates/common/migrations/002_parent_run_id.sql`

**Steps:**
- [ ] Confirm `runtime_runs` in `001_init.sql` has no `parent_run_id` column (already verified above — proceed directly).
- [ ] Create `crates/common/migrations/002_parent_run_id.sql`:

```sql
-- Add parent_run_id to runtime_runs to support delegation sub-run tracking.
ALTER TABLE runtime_runs ADD COLUMN parent_run_id TEXT REFERENCES runtime_runs(id);
CREATE INDEX IF NOT EXISTS idx_runtime_runs_parent ON runtime_runs(parent_run_id);
```

- [ ] Verify the migration file is picked up by the migration runner. In RushDino, `rushdino_common::db::run_migrations` uses `sqlx::migrate!("../common/migrations")`. The new file must be named with a numeric prefix higher than existing files (`001_init.sql` is the only existing migration) — `002_parent_run_id.sql` is correct.
- [ ] Run `cargo build -p rushdino-common` to confirm the migration compiles and is embedded correctly.
- [ ] Commit: `feat(db): add parent_run_id column to runtime_runs for delegation tracking`.

---

## Task 2: Expose `parent_run_id` in `NewRunRecord` and `RunSnapshot`

**Files:**
- Modify: `crates/agent/src/runtime/types.rs`
- Modify: `crates/agent/src/runtime/store.rs`

The `parent_run_id` must flow through the data layer so callers can create child runs and queries can filter by it.

**Steps:**
- [ ] In `crates/agent/src/runtime/types.rs`, add `parent_run_id: Option<String>` to `RunSnapshot`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSnapshot {
    pub id: String,
    pub kind: RunKind,
    pub state: RunState,
    pub parent_run_id: Option<String>,   // ← ADD THIS FIELD
    // ... all existing fields unchanged ...
    pub source: Option<String>,
    pub channel_id: Option<String>,
    pub sender_id: Option<String>,
    pub gateway_session_id: Option<String>,
    pub session_id: Option<String>,
    pub conversation_id: Option<String>,
    pub workflow_id: Option<String>,
    pub title: String,
    pub input_text: Option<String>,
    pub output_text: Option<String>,
    pub provider: String,
    pub model: String,
    pub fallback_profile_id: Option<String>,
    pub queue_position: Option<i64>,
    pub active_tool: Option<String>,
    pub abort_requested: bool,
    pub policy: RunPolicySnapshot,
    pub error: Option<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub updated_at: String,
}
```

- [ ] In `crates/agent/src/runtime/store.rs`, add `parent_run_id: Option<String>` to `NewRunRecord`:

```rust
pub struct NewRunRecord {
    pub id: String,
    pub kind: RunKind,
    pub state: RunState,
    pub parent_run_id: Option<String>,  // ← ADD THIS FIELD
    pub origin: RunOriginMetadata,
    // ... rest unchanged ...
}
```

- [ ] Update `insert_run` in `store.rs` to include `parent_run_id` in the INSERT statement:

```rust
pub async fn insert_run(&self, new_run: NewRunRecord) -> Result<RunSnapshot> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        r#"
        INSERT INTO runtime_runs (
          id, kind, state, source, channel_id, sender_id, gateway_session_id,
          session_id, conversation_id, workflow_id, title, input_text,
          output_text, provider, model, fallback_profile_id, queue_position, active_tool,
          policy_decision, approval_state, sandbox_state, effective_scope, reason, error,
          abort_requested, parent_run_id, created_at, started_at, completed_at, updated_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7,
          ?8, ?9, ?10, ?11, ?12,
          NULL, ?13, ?14, ?15, ?16, NULL,
          ?17, ?18, ?19, ?20, ?21, NULL,
          0, ?22, ?23, NULL, NULL, ?23
        )
        "#,
    )
    .bind(&new_run.id)
    .bind(new_run.kind.as_str())
    .bind(new_run.state.as_str())
    .bind(&new_run.origin.source)
    .bind(&new_run.origin.channel_id)
    .bind(&new_run.origin.sender_id)
    .bind(&new_run.origin.gateway_session_id)
    .bind(&new_run.session_id)
    .bind(&new_run.conversation_id)
    .bind(&new_run.workflow_id)
    .bind(&new_run.title)
    .bind(&new_run.input_text)
    .bind(&new_run.provider)
    .bind(&new_run.model)
    .bind(&new_run.fallback_profile_id)
    .bind(new_run.queue_position)
    .bind(&new_run.policy.decision)
    .bind(&new_run.policy.approval_state)
    .bind(&new_run.policy.sandbox_state)
    .bind(&new_run.policy.effective_scope)
    .bind(&new_run.policy.reason)
    .bind(&new_run.parent_run_id)   // ← bind ?22
    .bind(&now)                     // ← bind ?23
    .execute(self.pool.as_ref())
    .await?;
    // ... rest of function unchanged ...
}
```

- [ ] Update `get_run` and `list_runs` SELECT queries to include `parent_run_id` in the column list.
- [ ] Update `map_run_row` (at the bottom of `store.rs`) to read `parent_run_id`:

```rust
fn map_run_row(row: sqlx::sqlite::SqliteRow) -> Result<RunSnapshot> {
    use sqlx::Row;
    Ok(RunSnapshot {
        id: row.get("id"),
        kind: RunKind::parse(row.get::<String, _>("kind").as_str())?,
        state: RunState::parse(row.get::<String, _>("state").as_str())?,
        parent_run_id: row.get("parent_run_id"),   // ← ADD
        source: row.get("source"),
        // ... rest unchanged ...
    })
}
```

- [ ] Fix any compilation errors from callers that construct `NewRunRecord` directly — add `parent_run_id: None` to each site.
- [ ] Run `cargo build -p rushdino-agent` and fix all compile errors.
- [ ] Commit: `feat(agent): expose parent_run_id in NewRunRecord and RunSnapshot`.

---

## Task 3: GET /api/runs/{id}/children endpoint

**Files:**
- Modify: `crates/server/src/routes/runs.rs`
- Modify: `crates/server/src/lib.rs` (route registration)

**Steps:**
- [ ] Write the handler in `crates/server/src/routes/runs.rs`:

```rust
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChildRunSummary {
    pub id: String,
    pub state: String,
    pub model: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

/// GET /api/runs/:id/children
///
/// Returns all direct child runs whose `parent_run_id` matches the given run ID,
/// ordered by creation time ascending (natural spawn order).
pub async fn get_run_children(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<Vec<ChildRunSummary>>> {
    let engine = state.engine()?;
    let pool = engine.db_pool();   // see note below on pool access
    let rows = sqlx::query(
        r#"
        SELECT id, state, model, started_at, completed_at
        FROM runtime_runs
        WHERE parent_run_id = ?1
        ORDER BY created_at ASC
        "#,
    )
    .bind(&id)
    .fetch_all(pool.as_ref())
    .await
    .map_err(rushdino_common::AppError::from)?;

    let children = rows
        .into_iter()
        .map(|row| {
            use sqlx::Row;
            ChildRunSummary {
                id: row.get("id"),
                state: row.get("state"),
                model: row.get("model"),
                started_at: row.get("started_at"),
                completed_at: row.get("completed_at"),
            }
        })
        .collect();

    Ok(Json(children))
}
```

> **Note on pool access:** If `AgentEngine` does not expose a `db_pool()` method, add one to `crates/agent/src/engine.rs`:
> ```rust
> pub fn db_pool(&self) -> Arc<SqlitePool> {
>     self.runtime.pool()
> }
> ```
> And add `pub fn pool(&self) -> Arc<SqlitePool> { self.store.pool.clone() }` to `AgentRuntime` in `crates/agent/src/runtime/service.rs`. The `pool` field on `RunStore` is already `Arc<SqlitePool>`, so just expose it.

- [ ] Alternatively, add a `list_children` method directly to `AgentEngine`/`RunStore` to avoid leaking raw SQL into route handlers:

In `crates/agent/src/runtime/store.rs`:
```rust
pub async fn list_children(&self, parent_run_id: &str) -> Result<Vec<ChildRunSummary>> {
    let rows = sqlx::query(
        r#"
        SELECT id, state, model, started_at, completed_at
        FROM runtime_runs
        WHERE parent_run_id = ?1
        ORDER BY created_at ASC
        "#,
    )
    .bind(parent_run_id)
    .fetch_all(self.pool.as_ref())
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            use sqlx::Row;
            ChildRunSummary {
                id: row.get("id"),
                state: row.get("state"),
                model: row.get("model"),
                started_at: row.get("started_at"),
                completed_at: row.get("completed_at"),
            }
        })
        .collect())
}
```

> `ChildRunSummary` should be defined in `crates/agent/src/runtime/types.rs` and re-exported from `crates/agent/src/lib.rs` so the server crate can use it.

Then in `crates/agent/src/engine_assistant_runs.rs`:
```rust
pub async fn list_run_children(&self, parent_run_id: &str) -> Result<Vec<ChildRunSummary>> {
    self.runtime.list_children(parent_run_id).await
}
```

And in `crates/server/src/routes/runs.rs`:
```rust
pub async fn get_run_children(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<Vec<ChildRunSummary>>> {
    let engine = state.engine()?;
    let children = engine.list_run_children(&id).await?;
    Ok(Json(children))
}
```

- [ ] Register the route in `crates/server/src/lib.rs` after the existing run routes:

```rust
.route("/api/runs/:id/children", get(routes::runs::get_run_children))
```

- [ ] Write an integration test in `crates/agent/src/runtime/service_tests.rs` (or a new test module):

```rust
#[tokio::test]
async fn list_children_returns_only_direct_children() {
    use rushdino_common::db::run_migrations;
    let pool = Arc::new(SqlitePool::connect(":memory:").await.unwrap());
    run_migrations(&pool).await.unwrap();
    let store = RunStore::new(pool.clone());

    // Insert parent run
    let parent = store.insert_run(NewRunRecord {
        id: "parent-1".to_owned(),
        kind: RunKind::Assistant,
        state: RunState::Completed,
        parent_run_id: None,
        // ... other required fields with dummy values ...
    }).await.unwrap();

    // Insert two child runs
    for i in 1..=2 {
        store.insert_run(NewRunRecord {
            id: format!("child-{i}"),
            kind: RunKind::Assistant,
            state: RunState::Completed,
            parent_run_id: Some("parent-1".to_owned()),
            // ... other required fields ...
        }).await.unwrap();
    }

    // Insert unrelated run
    store.insert_run(NewRunRecord {
        id: "unrelated-1".to_owned(),
        kind: RunKind::Assistant,
        state: RunState::Completed,
        parent_run_id: None,
        // ...
    }).await.unwrap();

    let children = store.list_children("parent-1").await.unwrap();
    assert_eq!(children.len(), 2);
    assert!(children.iter().any(|c| c.id == "child-1"));
    assert!(children.iter().any(|c| c.id == "child-2"));
}
```

- [ ] Run `cargo test -p rushdino-agent` and verify PASS.
- [ ] Commit: `feat(api): add GET /api/runs/{id}/children endpoint`.

---

## Task 4: GET /api/runs/{id}/usage-summary endpoint

**Files:**
- Modify: `crates/agent/src/runtime/types.rs` (add `RunUsageSummary`)
- Modify: `crates/agent/src/runtime/store.rs` (add `get_usage_summary`)
- Modify: `crates/agent/src/engine_mgmt.rs` (expose `get_run_usage_summary`)
- Modify: `crates/server/src/routes/runs.rs` (add handler)
- Modify: `crates/server/src/lib.rs` (register route)

**Implementation notes:**
- `usage_metrics` is keyed by `conversation_id`, **not** `run_id`. The join must go through `runtime_runs` to find the `conversation_id` for the given run ID.
- Tool invocation count uses `COUNT(*)` from `runtime_run_events WHERE run_id = ? AND event_type = 'tool_start'`.

**Steps:**

- [ ] Add `RunUsageSummary` to `crates/agent/src/runtime/types.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunUsageSummary {
    pub total_tokens: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub tool_invocations: i64,
}
```

- [ ] Re-export `RunUsageSummary` from `crates/agent/src/lib.rs`:

```rust
pub use runtime::{
    ..., RunUsageSummary,
};
```

- [ ] Add `get_usage_summary` to `RunStore` in `crates/agent/src/runtime/store.rs`:

```rust
pub async fn get_usage_summary(&self, run_id: &str) -> Result<RunUsageSummary> {
    // Step 1: resolve conversation_id for this run
    let row = sqlx::query(
        "SELECT conversation_id FROM runtime_runs WHERE id = ?1",
    )
    .bind(run_id)
    .fetch_one(self.pool.as_ref())
    .await?;

    use sqlx::Row;
    let conversation_id: Option<String> = row.get("conversation_id");

    // Step 2: sum token usage — returns 0 rows if no usage recorded yet
    let (total_tokens, prompt_tokens, completion_tokens) = if let Some(conv_id) = &conversation_id {
        let usage_row = sqlx::query(
            r#"
            SELECT
              COALESCE(SUM(total_tokens), 0)      AS total_tokens,
              COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
              COALESCE(SUM(completion_tokens), 0) AS completion_tokens
            FROM usage_metrics
            WHERE conversation_id = ?1
              AND (auth_method IS NULL OR auth_method != 'oauth')
            "#,
        )
        .bind(conv_id)
        .fetch_one(self.pool.as_ref())
        .await?;

        (
            usage_row.get::<i64, _>("total_tokens"),
            usage_row.get::<i64, _>("prompt_tokens"),
            usage_row.get::<i64, _>("completion_tokens"),
        )
    } else {
        (0, 0, 0)
    };

    // Step 3: count tool invocations from run events
    let tool_row = sqlx::query(
        r#"
        SELECT COUNT(*) AS tool_invocations
        FROM runtime_run_events
        WHERE run_id = ?1
          AND event_type = 'tool_start'
        "#,
    )
    .bind(run_id)
    .fetch_one(self.pool.as_ref())
    .await?;

    let tool_invocations: i64 = tool_row.get("tool_invocations");

    Ok(RunUsageSummary {
        total_tokens,
        prompt_tokens,
        completion_tokens,
        tool_invocations,
    })
}
```

- [ ] Add `get_run_usage_summary` to `AgentEngine` via `crates/agent/src/engine_mgmt.rs`:

```rust
pub async fn get_run_usage_summary(&self, run_id: &str) -> Result<RunUsageSummary> {
    self.runtime.get_usage_summary(run_id).await
}
```

> Add `pub async fn get_usage_summary(&self, run_id: &str) -> Result<RunUsageSummary>` to `AgentRuntime` in `service.rs` that delegates to `self.store.get_usage_summary(run_id).await`.

- [ ] Add the route handler to `crates/server/src/routes/runs.rs`:

```rust
/// GET /api/runs/:id/usage-summary
///
/// Returns aggregated token usage and tool invocation count for the run.
/// Token counts are summed from usage_metrics via the run's conversation_id.
/// Tool invocations are counted from runtime_run_events with event_type = 'tool_start'.
pub async fn get_run_usage_summary(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<RunUsageSummary>> {
    let engine = state.engine()?;
    let summary = engine.get_run_usage_summary(&id).await?;
    Ok(Json(summary))
}
```

- [ ] Register route in `crates/server/src/lib.rs`:

```rust
.route("/api/runs/:id/usage-summary", get(routes::runs::get_run_usage_summary))
```

- [ ] Add `RunUsageSummary` to the `use rushdino_agent::...` import in `crates/server/src/routes/runs.rs`.

- [ ] Write an integration test in `crates/agent/src/runtime/store.rs` (test module at bottom):

```rust
#[tokio::test]
async fn get_usage_summary_aggregates_correctly() {
    use std::sync::Arc;
    use sqlx::SqlitePool;
    use rushdino_common::db::run_migrations;

    let pool = Arc::new(SqlitePool::connect(":memory:").await.unwrap());
    run_migrations(&pool).await.unwrap();
    let store = RunStore::new(pool.clone());

    // Insert a conversation
    sqlx::query(
        "INSERT INTO conversations (id, title, kind, created_at, updated_at) VALUES (?1, ?2, 'user', ?3, ?3)",
    )
    .bind("conv-sum-1")
    .bind("test")
    .bind(chrono::Utc::now().to_rfc3339())
    .execute(pool.as_ref())
    .await
    .unwrap();

    // Insert a run linked to the conversation
    store.insert_run(NewRunRecord {
        id: "run-sum-1".to_owned(),
        kind: RunKind::Assistant,
        state: RunState::Completed,
        parent_run_id: None,
        origin: RunOriginMetadata::default(),
        session_id: None,
        conversation_id: Some("conv-sum-1".to_owned()),
        workflow_id: None,
        title: "test run".to_owned(),
        input_text: None,
        provider: "anthropic".to_owned(),
        model: "claude-3-5-sonnet".to_owned(),
        fallback_profile_id: None,
        queue_position: None,
        policy: RunPolicySnapshot::default(),
    }).await.unwrap();

    // Insert usage metrics for the conversation
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO usage_metrics (id, conversation_id, provider, model, auth_method, prompt_tokens, completion_tokens, total_tokens, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )
    .bind("um-1")
    .bind("conv-sum-1")
    .bind("anthropic")
    .bind("claude-3-5-sonnet")
    .bind("apikey")
    .bind(100_i64)
    .bind(50_i64)
    .bind(150_i64)
    .bind(&now)
    .execute(pool.as_ref())
    .await
    .unwrap();

    // Insert tool_start events for the run
    for i in 0..3 {
        sqlx::query(
            "INSERT INTO runtime_run_events (id, run_id, event_type, policy_decision, approval_state, sandbox_state, effective_scope, created_at) \
             VALUES (?1, ?2, 'tool_start', 'allow', 'not_required', 'unknown', 'workspace', ?3)",
        )
        .bind(format!("evt-{i}"))
        .bind("run-sum-1")
        .bind(&now)
        .execute(pool.as_ref())
        .await
        .unwrap();
    }

    let summary = store.get_usage_summary("run-sum-1").await.unwrap();
    assert_eq!(summary.total_tokens, 150);
    assert_eq!(summary.prompt_tokens, 100);
    assert_eq!(summary.completion_tokens, 50);
    assert_eq!(summary.tool_invocations, 3);
}
```

- [ ] Run `cargo test -p rushdino-agent` and verify PASS.
- [ ] Commit: `feat(api): add GET /api/runs/{id}/usage-summary endpoint`.

---

## Task 5: Add children + usage to TypeScript API client

**Files:**
- Modify: `frontend/src/lib/api/runs.ts`

**Steps:**
- [ ] Add types and fetch functions to `frontend/src/lib/api/runs.ts`:

```typescript
// ── Delegation / sub-run types ────────────────────────────────────────────────

export interface ChildRunSummary {
  id: string;
  state: string;
  model: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface RunUsageSummary {
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  tool_invocations: number;
}

/** Returns all direct child runs spawned by the given parent run. */
export async function getRunChildren(runId: string): Promise<ChildRunSummary[]> {
  const endpoint = `/api/runs/${encodeURIComponent(runId)}/children`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

/** Returns aggregated token usage and tool invocation count for the given run. */
export async function getRunUsageSummary(runId: string): Promise<RunUsageSummary> {
  const endpoint = `/api/runs/${encodeURIComponent(runId)}/usage-summary`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}
```

- [ ] Verify TypeScript compiles: `cd frontend && npx tsc --noEmit`.
- [ ] Commit: `feat(frontend): add getRunChildren and getRunUsageSummary API client functions`.

---

## Task 6: SubRunTimeline component

**Files:**
- Create: `frontend/src/components/chat/sub-run-timeline.tsx`

This component is embedded in `DelegateRow` (Task 7) and shows child runs for a given parent run. It is **separate** from the existing `CompactTimeline` (which shows conversation items streamed via WebSocket). This component queries the REST API for structural child run data.

**Steps:**
- [ ] Create `frontend/src/components/chat/sub-run-timeline.tsx`:

```tsx
// SubRunTimeline — shows child runs spawned by a parent run.
// Displayed inline inside DelegateRow when the user expands a delegation entry.
// Queries REST API for child run list; each child links to its run detail page.

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getRunChildren } from '@/lib/api/runs';

interface SubRunTimelineProps {
  parentRunId: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function stateIcon(state: string) {
  switch (state) {
    case 'completed':
      return <CheckCircle2 size={11} className="text-emerald-400/70 shrink-0" />;
    case 'failed':
    case 'aborted':
      return <XCircle size={11} className="text-red-400/70 shrink-0" />;
    case 'running':
    case 'awaiting_approval':
    case 'awaiting_input':
      return <Loader2 size={11} className="text-amber-400 animate-spin shrink-0" />;
    default:
      return <Clock size={11} className="text-muted-foreground/40 shrink-0" />;
  }
}

function formatDuration(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function SubRunTimeline({ parentRunId, isExpanded, onToggle }: SubRunTimelineProps) {
  const navigate = useNavigate();

  const { data: children, isLoading } = useQuery({
    queryKey: ['run-children', parentRunId],
    queryFn: () => getRunChildren(parentRunId),
    staleTime: 30_000,
  });

  const count = children?.length ?? 0;

  return (
    <div className="mt-1.5">
      {/* Toggle header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
      >
        {isExpanded
          ? <ChevronDown size={9} />
          : <ChevronRight size={9} />}
        {isLoading
          ? <span>Loading sub-runs…</span>
          : count === 0
            ? <span>No sub-runs</span>
            : <span>{count} sub-run{count !== 1 ? 's' : ''}</span>}
      </button>

      {/* Expanded list */}
      {isExpanded && children && children.length > 0 && (
        <div className="mt-1 ml-3 space-y-0.5 border-l border-border/20 pl-2">
          {children.map((child) => {
            const duration = formatDuration(child.started_at, child.completed_at);
            return (
              <button
                key={child.id}
                type="button"
                onClick={() => navigate(`/runs/${child.id}`)}
                className={cn(
                  'w-full flex items-center gap-2 py-0.5 text-left',
                  'text-[10px] text-muted-foreground/60 hover:text-foreground/80 transition-colors',
                )}
              >
                {stateIcon(child.state)}
                <span className="font-mono text-[9px] text-muted-foreground/30 shrink-0">
                  {child.id.slice(0, 8)}
                </span>
                {child.model && (
                  <span className="text-muted-foreground/50 truncate">
                    {child.model}
                  </span>
                )}
                {duration && (
                  <span className="ml-auto shrink-0 text-muted-foreground/30">{duration}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] Verify TypeScript compiles: `cd frontend && npx tsc --noEmit`.
- [ ] Commit: `feat(frontend): add SubRunTimeline component for child run display`.

---

## Task 7: Embed SubRunTimeline and usage badge in DelegateRow

**Files:**
- Modify: `frontend/src/components/workspace/delegate-block.tsx`

The `DelegateRow` component already has the agent name, task, status, and an expandable `CompactTimeline` for live-streamed WS events. We need to:
1. Add a token usage badge showing total tokens once the run completes.
2. Add `SubRunTimeline` below the existing expanded content to show child runs.

`DelegateRow` currently derives `delegateConvId` from `agentName` (not a run ID). For the sub-run timeline we need the actual `run_id`. The `ToolItem` type has `args.run_id` if the backend includes it, but currently the delegate tool call args contain `agent_name` and `task`. We need to either:
- Use the `item.id` or a linked run ID if available.
- Or keep the sub-run timeline keyed on `delegateConvId` and add a lookup endpoint.

**Preferred approach:** Add `run_id?: string` to the tool call args when the engine emits the delegate tool. If this backend change is not ready yet, fall back to looking up children by `conversation_id` match. For this plan, assume the backend sets `run_id` in the delegate tool args at delegation time (see Task 8 for the backend wiring). The frontend reads `args.run_id` with a fallback of `undefined`.

- [ ] Add usage badge to the existing `DelegateRow` header, and add `SubRunTimeline` below the expanded content in `frontend/src/components/workspace/delegate-block.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { agentColor } from './agent-colors';
import { CompactTimeline } from './compact-timeline';
import { SubAgentMarkdown } from './sub-agent-markdown';
import { SubRunTimeline } from '@/components/chat/sub-run-timeline';
import { fetchConversation } from '@/lib/api';
import { getRunUsageSummary } from '@/lib/api/runs';
import { messagesToItems } from '@/lib/message-converter';
import { useChatWs } from '@/hooks/use-chat-ws';
import type { ConversationItem } from '@/lib/types';

type ToolItem = Extract<ConversationItem, { kind: 'tool_use' }>;

interface DelegateBlockProps {
  items: ToolItem[];
}

export function DelegateBlock({ items }: DelegateBlockProps) {
  return (
    <div className="py-1 space-y-1.5 animate-in fade-in duration-200">
      {items.map((item) => (
        <DelegateRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function DelegateRow({ item }: { item: ToolItem }) {
  const [expanded, setExpanded] = useState(false);
  const [subRunExpanded, setSubRunExpanded] = useState(false);
  const [fetchedItems, setFetchedItems] = useState<ConversationItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const { delegateItems, delegateItemsRevision } = useChatWs();

  const args = item.args as Record<string, string>;
  const agentName = args.agent_name ?? 'Agent';
  const task = args.task ?? '';
  const runId: string | undefined = args.run_id;
  const isRunning = item.status === 'running';
  const isDone = item.status === 'done';
  const isError = item.status === 'error';
  const colorClasses = agentColor(agentName);

  const delegateConvId = agentName.toLowerCase().replace(/ /g, '-');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const liveItems = delegateItems.get(delegateConvId) ?? null;
  const timelineItems = liveItems ?? fetchedItems;
  const hasTimeline = timelineItems != null && timelineItems.length > 0;

  // Usage badge — only fetch when run is done and we have a run_id.
  const { data: usage } = useQuery({
    queryKey: ['run-usage', runId],
    queryFn: () => getRunUsageSummary(runId!),
    enabled: isDone && runId != null,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (isRunning && liveItems && liveItems.length > 0) {
      setExpanded(true);
    }
  }, [isRunning, liveItems]);

  useEffect(() => {
    if (!expanded || liveItems || fetchedItems || loading) return;
    if (!isDone && !isError) return;

    setLoading(true);
    fetchConversation(delegateConvId)
      .then((detail) => {
        const items = messagesToItems(detail.messages, [], null).filter(
          (it) => it.kind !== 'user',
        );
        setFetchedItems(items);
      })
      .catch(() => setFetchedItems([]))
      .finally(() => setLoading(false));
  }, [expanded, liveItems, fetchedItems, loading, isDone, isError, delegateConvId]);

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden transition-colors',
      isRunning ? 'border-amber-400/20 bg-amber-400/[0.02]' : 'border-border/25 bg-muted/[0.03]',
    )}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/10 transition-colors"
      >
        <div className="shrink-0 w-5 h-5 rounded-md bg-muted/30 flex items-center justify-center">
          <Bot size={11} className="text-muted-foreground/50" />
        </div>

        <span className={cn(
          'text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 border',
          colorClasses,
        )}>
          {agentName}
        </span>

        <span className="text-[11px] text-foreground/60 truncate flex-1 min-w-0">
          {task}
        </span>

        {/* Token usage badge — shown after run completes */}
        {usage != null && (
          <span className="shrink-0 text-[9px] text-muted-foreground/40 tabular-nums">
            {usage.total_tokens.toLocaleString()} tokens
          </span>
        )}

        <span className="shrink-0">
          {isRunning && <Loader2 size={12} className="text-amber-400 animate-spin" />}
          {isDone && <CheckCircle2 size={12} className="text-emerald-400/70" />}
          {isError && <XCircle size={12} className="text-red-400/70" />}
        </span>

        <span className="shrink-0">
          {expanded
            ? <ChevronDown size={10} className="text-muted-foreground/30" />
            : <ChevronRight size={10} className="text-muted-foreground/30" />}
        </span>
      </button>

      {/* Expanded content: conversation timeline */}
      {expanded && (
        <div className="border-t border-border/15 px-3 py-2 max-h-80 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 size={14} className="animate-spin text-muted-foreground/40" />
            </div>
          ) : hasTimeline ? (
            <CompactTimeline
              items={timelineItems}
              agentName={agentName}
              isRunning={isRunning}
            />
          ) : isRunning ? (
            <CompactTimeline items={[]} agentName={agentName} isRunning />
          ) : item.result ? (
            <div className="text-[11px] text-muted-foreground/70">
              <SubAgentMarkdown content={item.result} />
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">No details available.</p>
          )}

          {/* Sub-run timeline — show child runs spawned by this delegation */}
          {runId != null && (
            <SubRunTimeline
              parentRunId={runId}
              isExpanded={subRunExpanded}
              onToggle={() => setSubRunExpanded((v) => !v)}
            />
          )}
        </div>
      )}

      {isRunning && (
        <div className="h-[2px] bg-gradient-to-r from-transparent via-amber-400/30 to-transparent animate-pulse" />
      )}
    </div>
  );
}
```

> **Important:** Add `useEffect` to the imports at the top of the file (`import { useEffect, useState } from 'react'`). The existing file already imports `useEffect` but the rewrite above must preserve it.

- [ ] Verify TypeScript compiles: `cd frontend && npx tsc --noEmit`.
- [ ] Commit: `feat(frontend): add token usage badge and sub-run timeline to DelegateRow`.

---

## Task 8: Fan-out coordination row

**Files:**
- Create: `frontend/src/components/chat/fan-out-row.tsx`

This component is used when multiple specialists are spawned in parallel (multiple child runs with the same parent). It shows a horizontal chip row with live status per specialist.

**Steps:**
- [ ] Create `frontend/src/components/chat/fan-out-row.tsx`:

```tsx
// FanOutRow — horizontal status chip row for parallel specialist runs.
// Only renders when there are 2+ child runs under the same parent (actual fan-out).
// Auto-refetches every 2s while any sibling is still running.

import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { getRunChildren } from '@/lib/api/runs';
import type { ChildRunSummary } from '@/lib/api/runs';

interface FanOutRowProps {
  /** The parent run whose children are the specialists in this fan-out. */
  parentRunId: string;
}

const TERMINAL_STATES = new Set(['completed', 'failed', 'aborted']);

function isRunning(state: string): boolean {
  return !TERMINAL_STATES.has(state);
}

function chipColor(state: string): string {
  switch (state) {
    case 'completed':
      return 'bg-emerald-400/20 text-emerald-400/80 border-emerald-400/20';
    case 'failed':
    case 'aborted':
      return 'bg-red-400/20 text-red-400/80 border-red-400/20';
    case 'running':
    case 'awaiting_approval':
    case 'awaiting_input':
      return 'bg-amber-400/20 text-amber-400/80 border-amber-400/20 animate-pulse';
    default:
      return 'bg-muted/20 text-muted-foreground/50 border-border/20';
  }
}

function dotColor(state: string): string {
  switch (state) {
    case 'completed':
      return 'bg-emerald-400';
    case 'failed':
    case 'aborted':
      return 'bg-red-400';
    case 'running':
    case 'awaiting_approval':
    case 'awaiting_input':
      return 'bg-amber-400 animate-pulse';
    default:
      return 'bg-muted-foreground/30';
  }
}

/** Abbreviate a model name to at most 12 chars for chip display. */
function abbreviateModel(model: string | null): string {
  if (!model) return 'agent';
  // e.g. "claude-3-5-sonnet-20241022" → "claude-3-5-s"
  return model.length > 12 ? model.slice(0, 12) : model;
}

function SpecialistChip({ child }: { child: ChildRunSummary }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-medium shrink-0',
        chipColor(child.state),
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor(child.state))} />
      <span>{abbreviateModel(child.model)}</span>
    </div>
  );
}

export function FanOutRow({ parentRunId }: FanOutRowProps) {
  const { data: siblings } = useQuery({
    queryKey: ['run-children', parentRunId],
    queryFn: () => getRunChildren(parentRunId),
    // Refetch every 2s while any sibling is still running; stop once all terminal.
    refetchInterval: (query) => {
      const data = query.state.data as ChildRunSummary[] | undefined;
      return data?.some((s) => isRunning(s.state)) ? 2000 : false;
    },
    staleTime: 0,
  });

  // Only render the fan-out row when there are 2+ siblings (actual parallelism).
  if (!siblings || siblings.length < 2) return null;

  return (
    <div className="flex items-center gap-2 py-1.5 overflow-x-auto scrollbar-none">
      <span className="text-[9px] text-muted-foreground/30 shrink-0 uppercase tracking-widest">
        fan-out
      </span>
      {siblings.map((child) => (
        <SpecialistChip key={child.id} child={child} />
      ))}
    </div>
  );
}
```

- [ ] Verify TypeScript compiles: `cd frontend && npx tsc --noEmit`.
- [ ] Decide where to render `FanOutRow`. The natural placement is in `DelegateBlock` if any item in the group shares a parent run ID, or in `DelegateRow` itself when the run has more than one child. Since `DelegateRow` renders per-delegation, add it at the bottom of the expanded section in `DelegateRow` (already modified in Task 7), after `SubRunTimeline`:

```tsx
{/* Fan-out view — shown when 2+ specialists were spawned in parallel */}
{runId != null && (
  <FanOutRow parentRunId={runId} />
)}
```

- [ ] Import `FanOutRow` in `delegate-block.tsx`:

```tsx
import { FanOutRow } from '@/components/chat/fan-out-row';
```

- [ ] Verify TypeScript compiles again after adding `FanOutRow` import and usage.
- [ ] Commit: `feat(frontend): add FanOutRow component for parallel specialist visualization`.

---

## Task 9: Backend — wire `parent_run_id` when spawning delegate runs (integration point)

**Files:**
- Investigate: `crates/agent/src/react_loop.rs` or wherever the `delegate`/`delegate_to_agent` tool is handled

This task ensures that when an agent spawns a child run, the child's `parent_run_id` is set and the tool call args include `run_id` so the frontend can use it.

**Steps:**
- [ ] Search for `delegate_to_agent` or `spawn_agents` tool handler in `crates/agent/src/`:

```bash
grep -rn "delegate_to_agent\|spawn_agents\|delegate.*run\|submit.*run.*parent" crates/agent/src/ --include="*.rs"
```

- [ ] In the handler that creates a child run, pass `parent_run_id`:

```rust
let child_run = engine.submit_http_run_with_parent(
    &session_id,
    conversation_id,
    &task,
    parent_run_id,  // ← pass the current run's ID
).await?;
```

- [ ] Add `submit_http_run_with_parent` to `AgentEngine` in `crates/agent/src/engine_assistant_runs.rs`, or extend the existing `submit_http_run` to accept an optional parent:

```rust
pub async fn submit_http_run(
    &self,
    session_id: &str,
    conversation_id: Option<String>,
    message: &str,
) -> Result<(RunSnapshot, tokio::sync::mpsc::Receiver<...>)> {
    self.submit_assistant_run_internal(session_id, conversation_id, message, None).await
}

pub async fn submit_http_run_with_parent(
    &self,
    session_id: &str,
    conversation_id: Option<String>,
    message: &str,
    parent_run_id: Option<String>,
) -> Result<(RunSnapshot, tokio::sync::mpsc::Receiver<...>)> {
    self.submit_assistant_run_internal(session_id, conversation_id, message, parent_run_id).await
}
```

- [ ] In `AgentRuntime::submit_assistant_run` in `service.rs`, propagate `parent_run_id` into `NewRunRecord`.
- [ ] Return the child run's ID in the tool call result JSON so the frontend `args.run_id` is populated.
- [ ] Run `cargo build` — fix any compile errors.
- [ ] Commit: `feat(agent): pass parent_run_id when spawning delegate child runs`.

---

## Task 10: End-to-end verification

**Steps:**
- [ ] Start the server locally: `cargo run -p rushdino-server`.
- [ ] Trigger a delegation by sending a task to an agent that delegates (e.g. via the chat UI or a direct API call).
- [ ] Verify `GET /api/runs/{parent_id}/children` returns the child runs.
- [ ] Verify `GET /api/runs/{child_id}/usage-summary` returns non-zero token counts after the run completes.
- [ ] Open the chat UI and confirm:
  - Token badge appears on the delegate row after completion.
  - Sub-run timeline shows the child runs inline when expanded.
  - Fan-out row appears (with 2+ chips) when multiple specialists run in parallel.
- [ ] Run full test suite: `cargo test --workspace`.
- [ ] Commit any remaining fixes.

---

## Summary of New Files and Modified Files

| Action | File |
|--------|------|
| CREATE | `crates/common/migrations/002_parent_run_id.sql` |
| MODIFY | `crates/agent/src/runtime/types.rs` — add `parent_run_id` to `RunSnapshot`, `NewRunRecord`; add `RunUsageSummary`, `ChildRunSummary` |
| MODIFY | `crates/agent/src/runtime/store.rs` — update INSERT/SELECT; add `list_children`, `get_usage_summary` |
| MODIFY | `crates/agent/src/runtime/service.rs` — add `list_children`, `get_usage_summary` delegate methods |
| MODIFY | `crates/agent/src/engine_mgmt.rs` — add `get_run_usage_summary` |
| MODIFY | `crates/agent/src/engine_assistant_runs.rs` — add `list_run_children`; propagate `parent_run_id` |
| MODIFY | `crates/agent/src/lib.rs` — re-export `RunUsageSummary`, `ChildRunSummary` |
| MODIFY | `crates/server/src/routes/runs.rs` — add `get_run_children`, `get_run_usage_summary` handlers |
| MODIFY | `crates/server/src/lib.rs` — register 2 new routes |
| MODIFY | `frontend/src/lib/api/runs.ts` — add `ChildRunSummary`, `RunUsageSummary`, `getRunChildren`, `getRunUsageSummary` |
| CREATE | `frontend/src/components/chat/sub-run-timeline.tsx` |
| CREATE | `frontend/src/components/chat/fan-out-row.tsx` |
| MODIFY | `frontend/src/components/workspace/delegate-block.tsx` — add usage badge, `SubRunTimeline`, `FanOutRow` |
