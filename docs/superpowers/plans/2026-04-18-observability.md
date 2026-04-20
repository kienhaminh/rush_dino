# Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trace IDs, provider latency metrics, tool analytics, and context size monitoring to make every agent run fully observable.

**Architecture:** Generate a UUID trace_id at run start and thread it through provider calls, tool invocations, and workflow steps. Store metrics in new DB columns and emit structured tracing logs for context size. No external tracing system required — all data stays local in SQLite.

**Tech Stack:** Rust, sqlx (SQLite), tracing crate, uuid crate, tokio

---

## Codebase Map (read before implementing)

Key files touched by this plan:

| File | Role |
|------|------|
| `crates/common/migrations/` | Migration SQL files — add `002_observability.sql` here |
| `crates/common/src/db.rs` | `run_migrations()` uses `sqlx::migrate!("./migrations")` — picks up new files automatically |
| `crates/agent/src/runtime/store.rs` | `insert_run()` — where `runtime_runs` rows are created |
| `crates/agent/src/runtime/types.rs` | `NewRunRecord` struct — needs `trace_id` field |
| `crates/agent/src/conversation.rs` | `save_tool_log()` — INSERT into `tool_logs` |
| `crates/agent/src/usage_metrics_store.rs` | `insert_usage()` — INSERT into `usage_metrics` |
| `crates/agent/src/react_loop.rs` | `append_tool_outputs()` — executes each tool call; `run_react_loop()` / `run_react_loop_streaming()` — calls provider and accumulates usage |
| `crates/providers/src/anthropic.rs` | `chat()` and `stream_chat()` — wraps reqwest calls |
| `crates/providers/src/openai/completions.rs` | OpenAI streaming provider |
| `crates/agent/src/context.rs` | `estimate_tokens(text)` already exists: `(text.chars().count() / 4).max(1)` |

**Dependency notes:**
- `uuid` crate is already in `crates/common/Cargo.toml` (workspace dep) and used in `crates/agent/`.
- `std::time::Instant` needs no new dependency.
- `tracing` crate is workspace dep — already used everywhere.
- `sqlx::migrate!()` in `crates/common/src/db.rs` resolves to `./migrations` relative to the crate root, so adding `002_observability.sql` there is sufficient.

---

## Task 1: Add observability columns via migration

**Files:**
- Create: `crates/common/migrations/002_observability.sql`
- Read (verify): `crates/common/src/db.rs` (no change needed — `sqlx::migrate!` auto-picks new files)

### Steps

- [ ] **1.1** Create the migration file with the following exact content:

```sql
-- 002_observability.sql
-- Add trace_id to runtime_runs for end-to-end request tracing.
ALTER TABLE runtime_runs ADD COLUMN trace_id TEXT;

-- Add per-call timing to tool_logs.
ALTER TABLE tool_logs ADD COLUMN duration_ms INTEGER;
ALTER TABLE tool_logs ADD COLUMN success INTEGER NOT NULL DEFAULT 1;

-- Add provider latency to usage_metrics.
ALTER TABLE usage_metrics ADD COLUMN ttft_ms INTEGER;
ALTER TABLE usage_metrics ADD COLUMN total_ms INTEGER;
```

- [ ] **1.2** Write a test to verify the migration applies cleanly. Add to `crates/common/src/db.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    #[tokio::test]
    async fn migration_002_applies_cleanly() {
        let pool = SqlitePool::connect(":memory:").await.expect("in-memory db");
        run_migrations(&pool).await.expect("migrations should apply");

        // Verify new columns exist by inserting a row that uses them.
        sqlx::query(
            "INSERT INTO conversations (id, title, created_at, updated_at) \
             VALUES ('c1', 'test', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        )
        .execute(&pool)
        .await
        .expect("insert conversation");

        sqlx::query(
            "INSERT INTO runtime_runs \
             (id, kind, state, title, provider, model, \
              policy_decision, approval_state, sandbox_state, effective_scope, \
              abort_requested, created_at, updated_at, trace_id) \
             VALUES ('r1', 'assistant', 'queued', 'test', 'anthropic', 'claude-sonnet-4-6', \
                     'allow', 'not_required', 'unknown', 'workspace', \
                     0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'trace-uuid-here')",
        )
        .execute(&pool)
        .await
        .expect("runtime_runs should accept trace_id column");

        // Verify tool_logs accepts duration_ms and success columns.
        sqlx::query(
            "INSERT INTO messages (id, conversation_id, role, content, created_at) \
             VALUES ('m1', 'c1', 'user', 'hello', '2026-01-01T00:00:00Z')",
        )
        .execute(&pool)
        .await
        .expect("insert message");

        sqlx::query(
            "INSERT INTO tool_logs \
             (id, message_id, tool_name, arguments, result, is_error, created_at, duration_ms, success) \
             VALUES ('t1', 'm1', 'bash', '{}', 'ok', 0, '2026-01-01T00:00:00Z', 42, 1)",
        )
        .execute(&pool)
        .await
        .expect("tool_logs should accept duration_ms and success columns");

        // Verify usage_metrics accepts ttft_ms and total_ms columns.
        sqlx::query(
            "INSERT INTO usage_metrics \
             (id, conversation_id, provider, model, auth_method, \
              prompt_tokens, completion_tokens, total_tokens, created_at, ttft_ms, total_ms) \
             VALUES ('u1', 'c1', 'anthropic', 'claude-sonnet-4-6', 'apikey', \
                     100, 50, 150, '2026-01-01T00:00:00Z', 312, 1850)",
        )
        .execute(&pool)
        .await
        .expect("usage_metrics should accept ttft_ms and total_ms columns");
    }
}
```

- [ ] **1.3** Run the test to confirm it passes:

```bash
cargo test -p rushdino-common migration_002_applies_cleanly
```

- [ ] **1.4** Commit:

```
git add crates/common/migrations/002_observability.sql crates/common/src/db.rs
git commit -m "feat(observability): add migration 002 — trace_id, timing columns"
```

---

## Task 2: Generate trace_id at run creation

**Files:**
- Modify: `crates/agent/src/runtime/types.rs` — add `trace_id: Option<String>` to `NewRunRecord`
- Modify: `crates/agent/src/runtime/store.rs` — include `trace_id` in INSERT and SELECT
- Modify: `crates/agent/src/runtime/types.rs` — add `trace_id: Option<String>` to `RunSnapshot`
- Modify all callers that construct `NewRunRecord` — add `trace_id: Some(Uuid::new_v4().to_string())`

### Steps

- [ ] **2.1** Read `crates/agent/src/runtime/types.rs` to identify the full `NewRunRecord` and `RunSnapshot` struct definitions.

- [ ] **2.2** Add `trace_id: Option<String>` to `NewRunRecord` and `RunSnapshot` in `crates/agent/src/runtime/types.rs`:

```rust
// In NewRunRecord struct — add field:
pub trace_id: Option<String>,

// In RunSnapshot struct — add field:
pub trace_id: Option<String>,
```

- [ ] **2.3** Update `insert_run()` in `crates/agent/src/runtime/store.rs`.

Change the INSERT SQL to include `trace_id`:

```rust
// Old column list (abridged):
//   id, kind, state, source, ..., abort_requested, created_at, started_at, completed_at, updated_at
// New column list adds trace_id:
sqlx::query(
    r#"
    INSERT INTO runtime_runs (
      id, kind, state, source, channel_id, sender_id, gateway_session_id,
      session_id, conversation_id, workflow_id, title, input_text,
      output_text, provider, model, fallback_profile_id, queue_position, active_tool,
      policy_decision, approval_state, sandbox_state, effective_scope, reason, error,
      abort_requested, created_at, started_at, completed_at, updated_at, trace_id
    ) VALUES (
      ?1, ?2, ?3, ?4, ?5, ?6, ?7,
      ?8, ?9, ?10, ?11, ?12,
      NULL, ?13, ?14, ?15, ?16, NULL,
      ?17, ?18, ?19, ?20, ?21, NULL,
      0, ?22, NULL, NULL, ?22, ?23
    )
    "#,
)
// ... all previous .bind() calls ...
.bind(&new_run.trace_id)  // ?23
```

- [ ] **2.4** Update `get_run()` and `list_runs()` in `store.rs` to select `trace_id` and map it in `map_run_row()`:

```rust
// In get_run() and list_runs() SELECT clause, append:
//   trace_id
// after updated_at

// In map_run_row() function, add:
trace_id: row.try_get("trace_id").ok(),
```

- [ ] **2.5** Write a test in `crates/agent/src/runtime/store.rs` that verifies `trace_id` is persisted:

```rust
#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use sqlx::SqlitePool;
    use uuid::Uuid;

    use crate::runtime::{
        store::{NewRunRecord, RunStore},
        types::{RunKind, RunOriginMetadata, RunPolicySnapshot, RunState},
    };

    async fn setup_store() -> RunStore {
        let pool = SqlitePool::connect(":memory:").await.expect("memory db");
        rushdino_common::db::run_migrations(&pool)
            .await
            .expect("migrations");
        RunStore::new(Arc::new(pool))
    }

    #[tokio::test]
    async fn insert_run_persists_trace_id() {
        let store = setup_store().await;
        let trace_id = Uuid::new_v4().to_string();

        let record = NewRunRecord {
            id: Uuid::new_v4().to_string(),
            kind: RunKind::Assistant,
            state: RunState::Queued,
            origin: RunOriginMetadata::default(),
            session_id: None,
            conversation_id: None,
            workflow_id: None,
            title: "test run".to_owned(),
            input_text: None,
            provider: "anthropic".to_owned(),
            model: "claude-sonnet-4-6".to_owned(),
            fallback_profile_id: None,
            queue_position: None,
            policy: RunPolicySnapshot::default(),
            trace_id: Some(trace_id.clone()),
        };

        let snapshot = store.insert_run(record).await.expect("insert run");
        assert_eq!(snapshot.trace_id, Some(trace_id));
    }
}
```

- [ ] **2.6** Find all callers of `NewRunRecord { ... }` in the codebase:

```bash
grep -r "NewRunRecord {" crates/agent/src/ --include="*.rs" -l
```

Update each one to add `trace_id: Some(Uuid::new_v4().to_string())`. The primary callers are in `crates/agent/src/runtime/mod.rs` or `crates/agent/src/engine_assistant_runs.rs` — check both.

- [ ] **2.7** Run tests:

```bash
cargo test -p rushdino-agent insert_run_persists_trace_id
```

- [ ] **2.8** Commit:

```
git add crates/agent/src/runtime/
git commit -m "feat(observability): generate and persist trace_id on every runtime run"
```

---

## Task 3: Record tool call duration and success in `tool_logs`

**Files:**
- Modify: `crates/agent/src/conversation.rs` — `save_tool_log()` signature and INSERT
- Modify: `crates/agent/src/react_loop.rs` — call site in `append_tool_outputs()` — pass `duration_ms` and `success` through the tuple
- Search for all other callers of `save_tool_log`

The current call chain is:
1. `append_tool_outputs()` in `react_loop.rs` executes tools and collects `(call, result, is_error)` tuples
2. These tuples are later passed to `conversation.save_tool_log()` — find exact location with `grep -n "save_tool_log" crates/agent/src/`

### Steps

- [ ] **3.1** Read `crates/agent/src/react_loop.rs` lines 558–720 (the full `append_tool_outputs` function) to understand where `(call, result, is_error)` tuple is built and returned.

- [ ] **3.2** Write the test first. Add to `crates/agent/src/conversation.rs` tests block:

```rust
#[tokio::test]
async fn save_tool_log_records_duration_and_success() {
    use std::sync::Arc;
    use sqlx::{Row, SqlitePool};
    use uuid::Uuid;
    use chrono::Utc;
    use rushdino_common::models::{ToolCall, Role, Message};

    let pool = SqlitePool::connect(":memory:").await.expect("memory db");
    rushdino_common::db::run_migrations(&pool)
        .await
        .expect("run migrations");
    let manager = ConversationManager::new(Arc::new(pool.clone()));

    let conv = manager
        .create_conversation("obs-test")
        .await
        .expect("create conversation");

    let msg_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO messages (id, conversation_id, role, content, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(&msg_id)
    .bind(&conv.id)
    .bind("tool")
    .bind("placeholder")
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .expect("insert message");

    let call = ToolCall {
        id: Uuid::new_v4().to_string(),
        name: "bash".to_owned(),
        arguments: serde_json::json!({"command": "echo hello"}),
    };

    manager
        .save_tool_log(&msg_id, &call, "hello\n", false, 123, true)
        .await
        .expect("save_tool_log");

    let row = sqlx::query(
        "SELECT duration_ms, success FROM tool_logs WHERE message_id = ?1",
    )
    .bind(&msg_id)
    .fetch_one(&pool)
    .await
    .expect("fetch tool log");

    assert_eq!(row.get::<Option<i64>, _>("duration_ms"), Some(123));
    assert_eq!(row.get::<i64, _>("success"), 1);
}
```

- [ ] **3.3** Update `save_tool_log()` in `crates/agent/src/conversation.rs` to accept `duration_ms: i64` and `success: bool` parameters and include them in the INSERT:

```rust
pub async fn save_tool_log(
    &self,
    message_id: &str,
    call: &ToolCall,
    result: &str,
    is_error: bool,
    duration_ms: i64,
    success: bool,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO tool_logs \
         (id, message_id, tool_name, arguments, result, is_error, created_at, duration_ms, success) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(message_id)
    .bind(&call.name)
    .bind(call.arguments.to_string())
    .bind(result)
    .bind(i64::from(is_error))
    .bind(Utc::now().to_rfc3339())
    .bind(duration_ms)
    .bind(i64::from(success))
    .execute(self.pool.as_ref())
    .await?;

    Ok(())
}
```

- [ ] **3.4** Instrument tool execution in `append_tool_outputs()` in `crates/agent/src/react_loop.rs`.

Change the tuple type from `(ToolCall, String, bool)` to `(ToolCall, String, bool, i64)` where the `i64` is `duration_ms`. Wrap the `tool.execute()` call with `Instant` timing:

```rust
// Add at top of file (already imported via std):
use std::time::Instant;

// In the async move block inside append_tool_outputs, replace:
//   if let Some(tool) = registry.get(&call.name) {
//       let result = match tool.execute(call.arguments.clone()).await {
//           Ok(value) => (call, value, false),
//           Err(err) => (call, err.to_string(), true),
//       };
// With:
if let Some(tool) = registry.get(&call.name) {
    let start = Instant::now();
    let (output, is_err) = match tool.execute(call.arguments.clone()).await {
        Ok(value) => (value, false),
        Err(err) => (err.to_string(), true),
    };
    let duration_ms = start.elapsed().as_millis() as i64;
    let result = (call, output, is_err, duration_ms);
    // ... rest of logging unchanged ...
    result
} else {
    // tool not found — duration 0
    let result = (call, "tool not found".to_owned(), true, 0i64);
    // ...
    result
}
```

Also update the rate-limited and empty-name early-return branches to add `0i64` as the fourth tuple element.

- [ ] **3.5** Update all sites that destructure the `(call, result, is_error)` tuple returned by `append_tool_outputs` to also capture `duration_ms`. In `react_loop.rs`, the results are collected and then iterated to build tool result messages. Find the collection loop (around line 695–730) and thread `duration_ms` through to the `save_tool_log` call.

Search for where `save_tool_log` is called from `react_loop.rs` or nearby — if it is called from `engine_chat.rs` or `engine_assistant_runs.rs`, update those call sites too:

```bash
grep -n "save_tool_log" crates/agent/src/ -r
```

Pass `duration_ms` and `success = !is_error` at each call site:

```rust
conversation.save_tool_log(
    message_id,
    &call,
    &result,
    is_error,
    duration_ms,
    !is_error,  // success = true when not an error
).await;
```

- [ ] **3.6** Run the test:

```bash
cargo test -p rushdino-agent save_tool_log_records_duration_and_success
```

- [ ] **3.7** Run full agent tests:

```bash
cargo test -p rushdino-agent
```

- [ ] **3.8** Commit:

```
git add crates/agent/src/conversation.rs crates/agent/src/react_loop.rs
git commit -m "feat(observability): record tool call duration_ms and success in tool_logs"
```

---

## Task 4: Record provider call timing in `usage_metrics`

**Files:**
- Modify: `crates/providers/src/anthropic.rs` — wrap `reqwest` calls with `Instant` timing; capture `ttft_ms` on first chunk
- Modify: `crates/providers/src/openai/completions.rs` — same
- Modify: `crates/providers/src/types.rs` — add timing fields to `ChatResponse` and `ChatChunk`
- Modify: `crates/agent/src/usage_metrics_store.rs` — `insert_usage()` accepts `ttft_ms` and `total_ms`
- Modify: `crates/agent/src/engine.rs` — `persist_usage_metric()` passes timing through

### Steps

- [ ] **4.1** Write the test first. Add to `crates/agent/src/usage_metrics_store.rs` tests block:

```rust
#[tokio::test]
async fn insert_usage_records_timing() {
    let pool = SqlitePool::connect(":memory:").await.expect("connect sqlite");
    run_migrations(&pool).await.expect("run migrations");

    let store = UsageMetricsStore::new(Arc::new(pool.clone()));

    let conversation_id = "test-conv-timing";
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO conversations (id, title, created_at, updated_at, archived_at) \
         VALUES (?1, ?2, ?3, ?4, NULL)",
    )
    .bind(conversation_id)
    .bind("timing test")
    .bind(now.clone())
    .bind(now)
    .execute(store.pool.as_ref())
    .await
    .expect("insert conversation");

    let usage = rushdino_providers::types::Usage {
        prompt_tokens: 50,
        completion_tokens: 20,
        total_tokens: 70,
    };
    store
        .insert_usage(
            conversation_id,
            "anthropic",
            "claude-sonnet-4-6",
            "apikey",
            &usage,
            Some(312),   // ttft_ms
            Some(1850),  // total_ms
        )
        .await
        .expect("insert usage with timing");

    let row = sqlx::query(
        "SELECT ttft_ms, total_ms FROM usage_metrics WHERE conversation_id = ?1",
    )
    .bind(conversation_id)
    .fetch_one(store.pool.as_ref())
    .await
    .expect("fetch usage row");

    assert_eq!(row.get::<Option<i64>, _>("ttft_ms"), Some(312));
    assert_eq!(row.get::<Option<i64>, _>("total_ms"), Some(1850));
}
```

- [ ] **4.2** Update `insert_usage()` in `crates/agent/src/usage_metrics_store.rs` to accept timing parameters:

```rust
pub async fn insert_usage(
    &self,
    conversation_id: &str,
    provider: &str,
    model: &str,
    auth_method: &str,
    usage: &Usage,
    ttft_ms: Option<i64>,
    total_ms: Option<i64>,
) -> Result<()> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO usage_metrics \
         (id, conversation_id, provider, model, auth_method, \
          prompt_tokens, completion_tokens, total_tokens, created_at, ttft_ms, total_ms) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
    )
    .bind(id)
    .bind(conversation_id)
    .bind(provider)
    .bind(model)
    .bind(auth_method)
    .bind(i64::from(usage.prompt_tokens))
    .bind(i64::from(usage.completion_tokens))
    .bind(i64::from(usage.total_tokens))
    .bind(now)
    .bind(ttft_ms)
    .bind(total_ms)
    .execute(self.pool.as_ref())
    .await?;
    Ok(())
}
```

- [ ] **4.3** Add timing fields to `ChatResponse` in `crates/providers/src/types.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub content: String,
    pub tool_calls: Vec<ToolCall>,
    pub rich_content: Option<RichContent>,
    pub usage: Option<Usage>,
    pub finish_reason: String,
    /// Wall-clock milliseconds for the entire provider call.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_ms: Option<i64>,
    /// Milliseconds from request send to first token received (streaming only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttft_ms: Option<i64>,
}
```

Update all `ChatResponse { ... }` construction sites in the codebase to include `total_ms: None, ttft_ms: None` (they are `Option` so existing sites that don't fill them are fine once the fields have defaults — but Rust requires all fields, so add them explicitly or use `..Default::default()` if `Default` is derived).

Search for all `ChatResponse {` constructions:

```bash
grep -rn "ChatResponse {" crates/ --include="*.rs"
```

Add `total_ms: None, ttft_ms: None` to each.

- [ ] **4.4** Instrument `AnthropicProvider::chat()` in `crates/providers/src/anthropic.rs`:

```rust
pub async fn chat(&self, mut request: ChatRequest) -> Result<ChatResponse> {
    let model = request.model.take().unwrap_or_else(|| self.model.clone());
    let body = to_anthropic_body(request, model, false, self.is_oauth());

    tracing::debug!(model = %body["model"].as_str().unwrap_or("unknown"), "anthropic chat request");

    let call_start = std::time::Instant::now();   // <-- ADD
    let response = self
        .authenticate(self.client.post("https://api.anthropic.com/v1/messages"))
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| AppError::Provider(format!("anthropic request failed: {e}")))?;

    // ... error handling unchanged ...

    let payload: Value = response
        .json()
        .await
        .map_err(|e| AppError::Provider(format!("anthropic parse error: {e}")))?;
    let total_ms = call_start.elapsed().as_millis() as i64;  // <-- ADD

    // ... parse content, tool_calls, usage unchanged ...

    Ok(ChatResponse {
        content,
        tool_calls,
        rich_content: None,
        usage,
        finish_reason: payload
            .get("stop_reason")
            .and_then(Value::as_str)
            .unwrap_or("stop")
            .to_owned(),
        total_ms: Some(total_ms),  // <-- ADD
        ttft_ms: None,             // non-streaming has no TTFT concept
    })
}
```

- [ ] **4.5** Instrument `AnthropicProvider::stream_chat()` in `crates/providers/src/anthropic.rs`.

The streaming path spawns a `tokio::spawn` task. The `ChatResponse` is returned through the receiver channel as the final `done` chunk. The approach: capture `call_start` before `.send()`, set `ttft_ms` on the first text or tool chunk, and set `total_ms` in the final `done` chunk.

```rust
pub async fn stream_chat(&self, request: ChatRequest) -> Result<mpsc::Receiver<ChatChunk>> {
    let (tx, rx) = mpsc::channel(128);
    // ...
    let call_start = std::time::Instant::now();  // <-- ADD before .send()
    let response = self
        .authenticate(...)
        // ... unchanged ...
        .send()
        .await
        .map_err(...)?;

    // ... error handling ...

    tokio::spawn(async move {
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut pending_tools: Vec<ToolCall> = Vec::new();
        let mut input_tokens: u32 = 0;
        let mut output_tokens: u32 = 0;
        let mut ttft_ms: Option<i64> = None;  // <-- ADD

        while let Some(item) = stream.next().await {
            // ...
            match event_type {
                "content_block_delta" => {
                    // When first text delta arrives, record TTFT.
                    if let Some(text) = value.pointer("/delta/text").and_then(Value::as_str) {
                        if ttft_ms.is_none() {
                            ttft_ms = Some(call_start.elapsed().as_millis() as i64);  // <-- ADD
                        }
                        let _ = tx.send(ChatChunk { delta: text.to_owned(), ... }).await;
                    }
                    // ... tool input delta unchanged ...
                }
                // ... other arms unchanged ...
            }
        }

        // Final done chunk — include timing.
        let total_ms = call_start.elapsed().as_millis() as i64;  // <-- ADD

        let final_usage = /* ... unchanged ... */;

        let _ = tx
            .send(ChatChunk {
                delta: String::new(),
                tool_calls: Vec::new(),
                done: true,
                usage: final_usage,
                thinking_delta: None,
                ttft_ms,      // <-- ADD (needs field on ChatChunk)
                total_ms: Some(total_ms),  // <-- ADD (needs field on ChatChunk)
            })
            .await;
    });

    Ok(rx)
}
```

This requires adding `ttft_ms: Option<i64>` and `total_ms: Option<i64>` to `ChatChunk` in `types.rs` as well. Add them as `#[serde(skip_serializing_if = "Option::is_none")]` optional fields. Then update all `ChatChunk { ... }` construction sites (numerous in both providers) to add `ttft_ms: None, total_ms: None` where not filling them.

- [ ] **4.6** Apply the same timing instrumentation to the OpenAI completions provider in `crates/providers/src/openai/completions.rs`. Follow the same pattern: `Instant::now()` before `.send()`, record `ttft_ms` on first token chunk, set `total_ms` in the final done chunk.

- [ ] **4.7** Update `persist_usage_metric()` in `crates/agent/src/engine.rs` to extract timing from `ChatResponse` and pass it through:

```rust
pub(crate) async fn persist_usage_metric(&self, conversation_id: &str, response: &ChatResponse) {
    let Some(usage) = response.usage.as_ref() else {
        return;
    };

    let auth_method_db = match self.auth_method {
        AuthMethod::ApiKey => "apikey",
        AuthMethod::OAuth => "oauth",
        AuthMethod::None => "none",
    };

    if let Err(err) = self
        .usage_metrics
        .insert_usage(
            conversation_id,
            &self.provider_name,
            self.provider.model(),
            auth_method_db,
            usage,
            response.ttft_ms,    // <-- ADD
            response.total_ms,   // <-- ADD
        )
        .await
    {
        tracing::warn!("failed to persist usage metric: {err}");
    }
}
```

- [ ] **4.8** For the streaming path (`run_react_loop_streaming`), timing on the final `ChatResponse` is assembled from accumulated chunks. The `total_ms` and `ttft_ms` can be extracted from the final `done` chunk when it arrives. In `react_loop.rs`, in the chunk processing loop:

```rust
let mut ttft_ms: Option<i64> = None;
let mut total_ms_from_stream: Option<i64> = None;

while let Some(chunk) = stream.recv().await {
    // Extract timing from done chunk before breaking.
    if chunk.done {
        ttft_ms = chunk.ttft_ms;
        total_ms_from_stream = chunk.total_ms;
        break;
    }
    // ... rest unchanged ...
}

// When constructing the final ChatResponse from accumulated content:
let mut final_response = ChatResponse {
    content,
    tool_calls: Vec::new(),
    rich_content: None,
    usage: total_usage.clone(),
    finish_reason: "stop".to_owned(),
    ttft_ms,
    total_ms: total_ms_from_stream,
};
```

- [ ] **4.9** Update the existing `excludes_oauth_auth_method_from_usage_queries` test in `usage_metrics_store.rs` to pass `None, None` for the new timing parameters in `insert_usage()` calls.

- [ ] **4.10** Run tests:

```bash
cargo test -p rushdino-agent insert_usage_records_timing
cargo test -p rushdino-agent
cargo test -p rushdino-providers
```

- [ ] **4.11** Commit:

```
git add crates/providers/src/ crates/agent/src/usage_metrics_store.rs crates/agent/src/engine.rs crates/agent/src/react_loop.rs
git commit -m "feat(observability): record provider latency (ttft_ms, total_ms) in usage_metrics"
```

---

## Task 5: Log context size before each LLM call

**Files:**
- Modify: `crates/agent/src/react_loop.rs` — add `tracing::info!` before each `provider.chat()` / `provider.stream_chat()` call

The codebase already has `estimate_tokens()` imported in `react_loop.rs` (used in `estimate_turn_usage`). The react loop has the full `messages` slice before each provider call. The `trace_id` is not yet threaded into the react loop; for this task we use `tracing::info!()` with whatever context is available.

### Steps

- [ ] **5.1** Write the test. Because `tracing` output is tricky to capture in unit tests, use `tracing-subscriber` with a custom collector. Add a focused test to `crates/agent/src/react_loop.rs` tests block:

```rust
#[cfg(test)]
mod context_size_tests {
    use std::sync::Arc;
    use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

    // This test verifies that the log line is emitted — it does NOT assert on
    // captured output (capturing structured tracing is complex). Instead it
    // verifies the estimate_tokens function returns correct values so the
    // computation emitted in the log is correct.
    #[test]
    fn context_token_estimate_is_sum_of_message_char_counts_divided_by_4() {
        use rushdino_common::models::{Message, Role};
        use crate::context::estimate_tokens;
        use chrono::Utc;

        let messages = vec![
            Message {
                id: "1".to_owned(),
                role: Role::System,
                content: "a".repeat(400), // 400 chars → 100 tokens
                tool_calls: None,
                rich_content: None,
                thinking: None,
                created_at: Utc::now(),
            },
            Message {
                id: "2".to_owned(),
                role: Role::User,
                content: "b".repeat(200), // 200 chars → 50 tokens
                tool_calls: None,
                rich_content: None,
                thinking: None,
                created_at: Utc::now(),
            },
        ];

        let token_estimate: usize = messages
            .iter()
            .map(|m| estimate_tokens(&m.content))
            .sum();

        assert_eq!(token_estimate, 150);
    }
}
```

- [ ] **5.2** Add the context size log to `run_react_loop()` in `crates/agent/src/react_loop.rs`. Insert this block immediately before `provider.chat(...)`:

```rust
// --- Context size log (observability) ---
let context_tokens_estimate: usize = messages
    .iter()
    .map(|m| estimate_tokens(&m.content))
    .sum();
tracing::info!(
    context_tokens_estimate = context_tokens_estimate,
    message_count = messages.len(),
    "llm_call_context_size"
);
// ----------------------------------------
let response = provider
    .chat(build_chat_request(messages.clone(), &session_ctx, config))
    .await?;
```

Note: `estimate_tokens` is already imported in `react_loop.rs` via `use crate::context::estimate_tokens;`.

- [ ] **5.3** Add the same log to the streaming path in `run_react_loop_streaming()`, immediately before `provider.stream_chat(...)`:

```rust
// --- Context size log (observability) ---
let context_tokens_estimate: usize = messages
    .iter()
    .map(|m| estimate_tokens(&m.content))
    .sum();
tracing::info!(
    context_tokens_estimate = context_tokens_estimate,
    message_count = messages.len(),
    "llm_call_context_size"
);
// ----------------------------------------
let mut stream = provider
    .stream_chat(build_chat_request(messages.clone(), &session_ctx, config))
    .await?;
```

- [ ] **5.4** Also add the log to the wrap-up call at the end of both `run_react_loop` and `run_react_loop_streaming` (the final no-tools call after max iterations). Those calls also go to the provider and should be tracked.

- [ ] **5.5** Run test:

```bash
cargo test -p rushdino-agent context_token_estimate_is_sum_of_message_char_counts_divided_by_4
```

- [ ] **5.6** Run full test suite to verify nothing is broken:

```bash
cargo test -p rushdino-agent
cargo test -p rushdino-providers
cargo test -p rushdino-common
```

- [ ] **5.7** Commit:

```
git add crates/agent/src/react_loop.rs
git commit -m "feat(observability): log context token estimate before each LLM call"
```

---

## Task 6: Wire trace_id through the react loop (optional but recommended)

**Context:** Tasks 1–5 give us DB columns and structured logs. To make the `trace_id` queryable in logs alongside context size, wire the `trace_id` from the `NewRunRecord` into the react loop call site and include it in the `tracing::info!` from Task 5.

**Files:**
- Modify: `crates/agent/src/react_loop.rs` — add optional `trace_id: Option<String>` param to `run_react_loop` and `run_react_loop_streaming`
- Modify: all call sites of these functions (found in `engine_chat.rs`, `engine_assistant_runs.rs`, `workflow_runner.rs`, `kanban_dispatcher.rs`, `tools/delegate_to_agent.rs`, `tools/session_tools.rs`, `tools/cron_tools.rs`)

### Steps

- [ ] **6.1** Add `trace_id: Option<&str>` as the last parameter to `run_react_loop()` and `run_react_loop_streaming()` signatures.

- [ ] **6.2** Update the context size log from Task 5 to include `trace_id`:

```rust
tracing::info!(
    trace_id = trace_id.unwrap_or("none"),
    context_tokens_estimate = context_tokens_estimate,
    message_count = messages.len(),
    "llm_call_context_size"
);
```

- [ ] **6.3** Update all call sites. For sites that already have a `run_id` or `trace_id` in scope (e.g., `engine_assistant_runs.rs` has `run_id`), pass it. For call sites without a trace ID in scope, pass `None`.

The call sites are:
- `crates/agent/src/engine_chat.rs` — 2 call sites — pass `None` (no run_id available here)
- `crates/agent/src/engine_assistant_runs.rs` — 2 call sites — pass `Some(run_id.as_str())` (run_id is in scope)
- `crates/agent/src/workflow_runner.rs` — 1 call site — pass `None` or workflow run ID
- `crates/agent/src/kanban_dispatcher.rs` — 1 call site — pass `None`
- `crates/agent/src/tools/delegate_to_agent.rs` — 1 call site — pass `None`
- `crates/agent/src/tools/session_tools.rs` — 1 call site — pass `None`
- `crates/agent/src/tools/cron_tools.rs` — 1 call site — pass `None`

- [ ] **6.4** Run all tests:

```bash
cargo test -p rushdino-agent
```

- [ ] **6.5** Commit:

```
git add crates/agent/src/react_loop.rs crates/agent/src/engine_chat.rs \
        crates/agent/src/engine_assistant_runs.rs crates/agent/src/workflow_runner.rs \
        crates/agent/src/kanban_dispatcher.rs crates/agent/src/tools/
git commit -m "feat(observability): thread trace_id into react loop context size logs"
```

---

## Final Verification Checklist

Before declaring this plan complete, verify the following:

- [ ] `cargo test -p rushdino-common` passes (migration test included)
- [ ] `cargo test -p rushdino-agent` passes (all new tests included)
- [ ] `cargo test -p rushdino-providers` passes
- [ ] `cargo build` clean (no warnings about unused fields)
- [ ] SQLite schema inspection confirms new columns exist on a fresh DB:

```bash
# Start the server once to initialize the DB, then:
sqlite3 ~/.config/rushdino/rushdino.db ".schema runtime_runs" | grep trace_id
sqlite3 ~/.config/rushdino/rushdino.db ".schema tool_logs" | grep duration_ms
sqlite3 ~/.config/rushdino/rushdino.db ".schema usage_metrics" | grep ttft_ms
```

- [ ] Run one actual agent turn and check the logs for `llm_call_context_size` structured event
- [ ] Query the DB after a run to verify `trace_id` is populated in `runtime_runs`

---

## Implementation Order Summary

| Task | Time estimate | Key risk |
|------|--------------|----------|
| 1 — Migration SQL | 15 min | None — SQLite ALTER TABLE is safe |
| 2 — trace_id generation | 30 min | `NewRunRecord` struct has many call sites; update all |
| 3 — Tool timing | 30 min | Tuple type change in `append_tool_outputs` propagates widely |
| 4 — Provider timing | 60 min | `ChatChunk` / `ChatResponse` field additions touch both providers and all construction sites |
| 5 — Context size log | 15 min | No risk — additive only |
| 6 — trace_id in logs | 20 min | Signature change touches 7+ call sites |

**Total: ~2.5–3 hours** for an experienced implementer working through the plan step by step.
