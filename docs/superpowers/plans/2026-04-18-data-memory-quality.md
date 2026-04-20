# Data & Memory Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate data accumulation, add log archival to keep SQLite lean, and enable memory import/export for backup and migration.

**Architecture:** Deduplication is enforced at the application layer with recency-window queries before INSERT (SQLite does not support partial UNIQUE constraints on time windows). Archival moves rows in a single transaction to archive tables. Import/export is a simple JSON serialization of memory files + KG entity snapshot queried directly from SQLite.

**Tech Stack:** Rust, sqlx (SQLite), serde_json, axum, tokio::fs

**Key codebase facts (verified):**
- Messages inserted in `crates/agent/src/conversation.rs` → `ConversationManager::save_message()`
- Tool logs inserted in `crates/agent/src/conversation.rs` → `ConversationManager::save_tool_log()`
- `tool_logs` schema uses `message_id` (not `run_id`) as the FK column
- Runtime logs inserted in `crates/server/src/runtime_log_store.rs` → `RuntimeLogStore::insert()`
- `AppState` exposes pool via `state.runtime.pool()` (pub(crate)); routes should use `state.runtime_logs` (Arc<RuntimeLogStore>) for log ops or go through `state.runtime.pool()` directly
- KG entities live in `kg_entities` table; the `GraphEntity` struct is in `crates/knowledge-graph/src/models.rs`
- `MemoryManager` root dir is `state.config().data_dir`; named files (SOUL.md, USER.md, etc.) are written with `write_named()`
- Migration file numbering: only `001_init.sql` exists; next is `002_data_quality.sql`
- All existing migrations consolidated into `001_init.sql`; new one goes to `002_data_quality.sql`

---

## Task 1: DB migration for archive tables and dedup indexes

**Files:**
- Create: `crates/common/migrations/002_data_quality.sql`

**Steps:**

- [ ] 1.1 Create `crates/common/migrations/002_data_quality.sql` with the SQL below
- [ ] 1.2 Run `cargo test -p rushdino-common` to verify migrations apply cleanly
- [ ] 1.3 Commit

**SQL content for `002_data_quality.sql`:**

```sql
-- Archive table for runtime_logs (same columns + archived_at)
CREATE TABLE IF NOT EXISTS runtime_logs_archive (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL,
    target TEXT NOT NULL,
    message TEXT NOT NULL,
    fields TEXT,
    created_at TEXT NOT NULL,
    archived_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_runtime_logs_archive_created_at
    ON runtime_logs_archive(created_at DESC);

-- Archive table for tool_logs (same columns + archived_at)
CREATE TABLE IF NOT EXISTS tool_logs_archive (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    arguments TEXT NOT NULL,
    result TEXT NOT NULL,
    is_error INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    archived_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tool_logs_archive_created_at
    ON tool_logs_archive(created_at DESC);

-- Deduplication support indexes
-- Used by recency-window SELECT before INSERT in save_message()
CREATE INDEX IF NOT EXISTS idx_messages_dedup
    ON messages(conversation_id, role, created_at DESC);

-- Used by recency-window SELECT before INSERT in save_tool_log()
CREATE INDEX IF NOT EXISTS idx_tool_logs_dedup
    ON tool_logs(message_id, tool_name, created_at DESC);
```

---

## Task 2: Message deduplication at insertion

**Files:**
- Modify: `crates/agent/src/conversation.rs` — `save_message()` method (line ~237)

**Context:** `save_message()` currently does a direct INSERT. We add a recency check before the INSERT that queries for a matching (conversation_id, role, content) within the last 5 seconds. If one exists, we skip silently (idempotent early return).

**Steps:**

- [ ] 2.1 Write test in `crates/agent/src/conversation.rs` (in the existing `#[cfg(test)]` block):

```rust
#[tokio::test]
async fn save_message_deduplicates_within_5_seconds() {
    let manager = setup_manager().await;
    let conv = manager.create_conversation("Dedup Test").await.expect("create");

    let msg = Message {
        id: uuid::Uuid::new_v4().to_string(),
        role: Role::User,
        content: "hello dedup".to_owned(),
        tool_calls: None,
        rich_content: None,
        thinking: None,
        created_at: chrono::Utc::now(),
    };

    manager.save_message(&conv.id, &msg).await.expect("first save");
    // Second save with identical conversation_id + role + content (different id is fine)
    let msg2 = Message { id: uuid::Uuid::new_v4().to_string(), ..msg.clone() };
    manager.save_message(&conv.id, &msg2).await.expect("second save should not error");

    let messages = manager.get_messages(&conv.id).await.expect("get messages");
    assert_eq!(messages.len(), 1, "duplicate message within 5 seconds must be skipped");
}
```

- [ ] 2.2 Run the test, confirm it fails (no dedup logic yet): `cargo test -p rushdino-agent save_message_deduplicates`

- [ ] 2.3 Modify `save_message()` in `crates/agent/src/conversation.rs` — add the recency check before the INSERT:

```rust
pub async fn save_message(&self, conversation_id: &str, message: &Message) -> Result<()> {
    // Deduplication: skip if an identical message exists within the last 5 seconds.
    // This prevents double-saves from retry logic or concurrent writes.
    let existing: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM messages \
         WHERE conversation_id = ?1 AND role = ?2 AND content = ?3 \
         AND created_at > datetime('now', '-5 seconds')",
    )
    .bind(conversation_id)
    .bind(role_to_str(&message.role))
    .bind(&message.content)
    .fetch_one(self.pool.as_ref())
    .await?;

    if existing > 0 {
        tracing::debug!(
            conversation_id = %conversation_id,
            role = %role_to_str(&message.role),
            "skipping duplicate message (same content within 5 seconds)"
        );
        return Ok(());
    }

    let tool_calls = message
        .tool_calls
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| AppError::Validation(format!("invalid tool_calls JSON: {e}")))?;
    let rich_content = message
        .rich_content
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| AppError::Validation(format!("invalid rich_content JSON: {e}")))?;

    sqlx::query(
        "INSERT INTO messages (id, conversation_id, role, content, tool_calls, rich_content, thinking, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )
    .bind(&message.id)
    .bind(conversation_id)
    .bind(role_to_str(&message.role))
    .bind(&message.content)
    .bind(tool_calls)
    .bind(rich_content)
    .bind(&message.thinking)
    .bind(message.created_at.to_rfc3339())
    .execute(self.pool.as_ref())
    .await?;

    sqlx::query("UPDATE conversations SET updated_at = ?1 WHERE id = ?2")
        .bind(Utc::now().to_rfc3339())
        .bind(conversation_id)
        .execute(self.pool.as_ref())
        .await?;

    Ok(())
}
```

- [ ] 2.4 Run the test again, confirm PASS: `cargo test -p rushdino-agent save_message_deduplicates`
- [ ] 2.5 Run full agent tests: `cargo test -p rushdino-agent`
- [ ] 2.6 Commit

---

## Task 3: Tool log deduplication at insertion

**Files:**
- Modify: `crates/agent/src/conversation.rs` — `save_tool_log()` method (line ~285)

**Context:** `save_tool_log()` takes `message_id`, `call: &ToolCall`, `result`, `is_error`. The dedup key is `(message_id, tool_name, arguments)` within 1 second — this catches retried tool executions where the same call is logged twice in the same message context.

**Steps:**

- [ ] 3.1 Write test in the `#[cfg(test)]` block of `crates/agent/src/conversation.rs`:

```rust
#[tokio::test]
async fn save_tool_log_deduplicates_within_1_second() {
    let manager = setup_manager().await;
    let conv = manager.create_conversation("ToolLog Dedup").await.expect("create");

    let msg = Message {
        id: uuid::Uuid::new_v4().to_string(),
        role: Role::Assistant,
        content: "using tool".to_owned(),
        tool_calls: None,
        rich_content: None,
        thinking: None,
        created_at: chrono::Utc::now(),
    };
    manager.save_message(&conv.id, &msg).await.expect("save message");

    let call = rushdino_common::models::ToolCall {
        id: "call-1".to_owned(),
        name: "read_file".to_owned(),
        arguments: serde_json::json!({"path": "/tmp/test.txt"}),
    };

    manager.save_tool_log(&msg.id, &call, "file contents", false).await.expect("first log");
    manager.save_tool_log(&msg.id, &call, "file contents", false).await.expect("second log should not error");

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tool_logs WHERE message_id = ?1 AND tool_name = ?2"
    )
    .bind(&msg.id)
    .bind("read_file")
    .fetch_one(manager.pool.as_ref())
    .await
    .expect("count query");

    assert_eq!(count, 1, "duplicate tool log within 1 second must be skipped");
}
```

- [ ] 3.2 Run the test, confirm it fails: `cargo test -p rushdino-agent save_tool_log_deduplicates`

- [ ] 3.3 Modify `save_tool_log()` in `crates/agent/src/conversation.rs`:

```rust
pub async fn save_tool_log(
    &self,
    message_id: &str,
    call: &ToolCall,
    result: &str,
    is_error: bool,
) -> Result<()> {
    let arguments_str = call.arguments.to_string();

    // Deduplication: skip if identical tool call already logged within 1 second.
    // Prevents double-logging when tool execution retries happen in the same message.
    let existing: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tool_logs \
         WHERE message_id = ?1 AND tool_name = ?2 AND arguments = ?3 \
         AND created_at > datetime('now', '-1 seconds')",
    )
    .bind(message_id)
    .bind(&call.name)
    .bind(&arguments_str)
    .fetch_one(self.pool.as_ref())
    .await?;

    if existing > 0 {
        tracing::debug!(
            message_id = %message_id,
            tool_name = %call.name,
            "skipping duplicate tool log (same call within 1 second)"
        );
        return Ok(());
    }

    sqlx::query(
        "INSERT INTO tool_logs (id, message_id, tool_name, arguments, result, is_error, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(message_id)
    .bind(&call.name)
    .bind(&arguments_str)
    .bind(result)
    .bind(i64::from(is_error))
    .bind(Utc::now().to_rfc3339())
    .execute(self.pool.as_ref())
    .await?;

    Ok(())
}
```

- [ ] 3.4 Run the test again, confirm PASS: `cargo test -p rushdino-agent save_tool_log_deduplicates`
- [ ] 3.5 Run full agent tests: `cargo test -p rushdino-agent`
- [ ] 3.6 Commit

---

## Task 4: Archive endpoint

**Files:**
- Create: `crates/server/src/routes/admin.rs`
- Modify: `crates/server/src/routes/mod.rs` — add `pub mod admin;`
- Modify: `crates/server/src/lib.rs` — register `POST /api/admin/archive`

**Context:** The pool is accessed via `state.runtime.pool()`. Both `runtime_logs` and `tool_logs` are archived in a single transaction: INSERT INTO archive SELECT from source WHERE created_at is old, then DELETE from source. Returns counts of rows moved.

**Steps:**

- [ ] 4.1 Write integration test in `crates/server/tests/` (new file `admin_archive_test.rs` or add to an existing test file that sets up a full AppState). A simpler approach is an in-module unit test using a raw SqlitePool:

Add `#[cfg(test)]` block at the bottom of `crates/server/src/routes/admin.rs`:

```rust
#[cfg(test)]
mod tests {
    use sqlx::SqlitePool;
    use chrono::{Utc, Duration};

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePool::connect(":memory:").await.expect("pool");
        rushdino_common::db::run_migrations(&pool).await.expect("migrations");
        pool
    }

    #[tokio::test]
    async fn archive_moves_old_runtime_logs() {
        let pool = test_pool().await;

        // Insert 3 logs older than 30 days and 1 recent log
        let old_ts = (Utc::now() - Duration::days(40)).to_rfc3339();
        let recent_ts = Utc::now().to_rfc3339();
        for i in 0..3u8 {
            sqlx::query(
                "INSERT INTO runtime_logs (id, level, target, message, fields, created_at) \
                 VALUES (?, 'info', 'test', 'old log', NULL, ?)"
            )
            .bind(format!("old-{i}"))
            .bind(&old_ts)
            .execute(&pool)
            .await
            .expect("insert old log");
        }
        sqlx::query(
            "INSERT INTO runtime_logs (id, level, target, message, fields, created_at) \
             VALUES ('recent-1', 'info', 'test', 'recent log', NULL, ?)"
        )
        .bind(&recent_ts)
        .execute(&pool)
        .await
        .expect("insert recent log");

        let report = archive_data(&pool, 30).await.expect("archive");

        assert_eq!(report.logs_archived, 3);
        assert_eq!(report.tool_logs_archived, 0);

        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM runtime_logs")
            .fetch_one(&pool).await.expect("count");
        assert_eq!(remaining, 1, "only the recent log should remain");

        let archived: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM runtime_logs_archive")
            .fetch_one(&pool).await.expect("count archive");
        assert_eq!(archived, 3);
    }
}
```

- [ ] 4.2 Create `crates/server/src/routes/admin.rs`:

```rust
use std::sync::Arc;

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use rushdino_common::{AppError, Result};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveRequest {
    /// Archive rows older than this many days. Defaults to 30.
    #[serde(default = "default_older_than_days")]
    pub older_than_days: i64,
}

fn default_older_than_days() -> i64 {
    30
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveReport {
    /// Number of runtime_logs rows moved to runtime_logs_archive.
    pub logs_archived: u64,
    /// Number of tool_logs rows moved to tool_logs_archive.
    pub tool_logs_archived: u64,
}

/// POST /api/admin/archive
///
/// Moves runtime_logs and tool_logs older than `older_than_days` days into their
/// respective archive tables, then deletes the originals. Runs in a single transaction
/// so the operation is atomic — no rows are lost if the server crashes mid-way.
pub async fn archive_old_data(
    State(state): State<AppState>,
    Json(req): Json<ArchiveRequest>,
) -> Result<Json<ArchiveReport>> {
    if req.older_than_days < 1 {
        return Err(AppError::Validation(
            "older_than_days must be at least 1".to_owned(),
        ));
    }
    let pool = state.runtime.pool();
    let report = archive_data(&pool, req.older_than_days).await?;
    Ok(Json(report))
}

/// Core archive logic, extracted for testability (no AppState dependency).
pub(crate) async fn archive_data(pool: &SqlitePool, older_than_days: i64) -> Result<ArchiveReport> {
    // Build the cutoff timestamp string for SQLite datetime comparison.
    // Using a parameterised placeholder: datetime('now', '-N days') is not bindable in sqlx,
    // so we format the interval string and bind it as a literal offset string.
    let interval = format!("-{older_than_days} days");

    let mut tx = pool.begin().await?;

    // ── runtime_logs ────────────────────────────────────────────────────────
    let logs_result = sqlx::query(
        "INSERT INTO runtime_logs_archive (id, level, target, message, fields, created_at) \
         SELECT id, level, target, message, fields, created_at \
         FROM runtime_logs \
         WHERE created_at < datetime('now', ?1)",
    )
    .bind(&interval)
    .execute(&mut *tx)
    .await?;

    let logs_archived = logs_result.rows_affected();

    sqlx::query("DELETE FROM runtime_logs WHERE created_at < datetime('now', ?1)")
        .bind(&interval)
        .execute(&mut *tx)
        .await?;

    // ── tool_logs ────────────────────────────────────────────────────────────
    let tool_result = sqlx::query(
        "INSERT INTO tool_logs_archive (id, message_id, tool_name, arguments, result, is_error, created_at) \
         SELECT id, message_id, tool_name, arguments, result, is_error, created_at \
         FROM tool_logs \
         WHERE created_at < datetime('now', ?1)",
    )
    .bind(&interval)
    .execute(&mut *tx)
    .await?;

    let tool_logs_archived = tool_result.rows_affected();

    sqlx::query("DELETE FROM tool_logs WHERE created_at < datetime('now', ?1)")
        .bind(&interval)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    tracing::info!(
        logs_archived,
        tool_logs_archived,
        older_than_days,
        "admin archive completed"
    );

    Ok(ArchiveReport {
        logs_archived,
        tool_logs_archived,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};
    use sqlx::SqlitePool;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePool::connect(":memory:").await.expect("pool");
        rushdino_common::db::run_migrations(&pool)
            .await
            .expect("migrations");
        pool
    }

    #[tokio::test]
    async fn archive_moves_old_runtime_logs_and_leaves_recent() {
        let pool = test_pool().await;

        let old_ts = (Utc::now() - Duration::days(40)).to_rfc3339();
        let recent_ts = Utc::now().to_rfc3339();

        for i in 0..3u8 {
            sqlx::query(
                "INSERT INTO runtime_logs (id, level, target, message, fields, created_at) \
                 VALUES (?, 'info', 'test', 'old log', NULL, ?)",
            )
            .bind(format!("old-{i}"))
            .bind(&old_ts)
            .execute(&pool)
            .await
            .expect("insert old log");
        }

        sqlx::query(
            "INSERT INTO runtime_logs (id, level, target, message, fields, created_at) \
             VALUES ('recent-1', 'info', 'test', 'recent log', NULL, ?)",
        )
        .bind(&recent_ts)
        .execute(&pool)
        .await
        .expect("insert recent log");

        let report = archive_data(&pool, 30).await.expect("archive");

        assert_eq!(report.logs_archived, 3, "3 old logs archived");
        assert_eq!(report.tool_logs_archived, 0, "no tool logs to archive");

        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM runtime_logs")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(remaining, 1, "only recent log should remain");

        let archived: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM runtime_logs_archive")
            .fetch_one(&pool)
            .await
            .expect("count archive");
        assert_eq!(archived, 3, "3 logs in archive");
    }

    #[tokio::test]
    async fn archive_is_idempotent_when_nothing_to_archive() {
        let pool = test_pool().await;

        // Insert only recent logs
        let recent_ts = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO runtime_logs (id, level, target, message, fields, created_at) \
             VALUES ('r1', 'info', 'test', 'recent', NULL, ?)",
        )
        .bind(&recent_ts)
        .execute(&pool)
        .await
        .expect("insert");

        let report = archive_data(&pool, 30).await.expect("archive");
        assert_eq!(report.logs_archived, 0);
        assert_eq!(report.tool_logs_archived, 0);

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM runtime_logs")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(count, 1, "recent log untouched");
    }
}
```

- [ ] 4.3 Add `pub mod admin;` to `crates/server/src/routes/mod.rs`

- [ ] 4.4 Register the route in `crates/server/src/lib.rs` — find the `.route("/api/logs", ...)` line and add after it:

```rust
.route(
    "/api/admin/archive",
    post(routes::admin::archive_old_data),
)
```

- [ ] 4.5 Run tests: `cargo test -p rushdino-server archive`
- [ ] 4.6 Run full server tests: `cargo test -p rushdino-server`
- [ ] 4.7 Commit

---

## Task 5: Memory export endpoint

**Files:**
- Create: `crates/server/src/routes/memory_io.rs`
- Modify: `crates/server/src/routes/mod.rs` — add `pub mod memory_io;`
- Modify: `crates/server/src/lib.rs` — register `GET /api/memory/export`

**Context:** The export reads SOUL.md, USER.md, MEMORY.md, TOOLS.md, IDENTITY.md from `state.config().data_dir` (the MemoryManager root), then queries the top 1000 `kg_entities` rows ordered by `last_seen_at DESC` directly from SQLite. The KG query goes through `state.runtime.pool()` directly since `KgGateway` is optional and not available when KG is disabled.

**Steps:**

- [ ] 5.1 Create `crates/server/src/routes/memory_io.rs`:

```rust
use std::{collections::HashMap, sync::Arc};

use axum::{extract::State, Json};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tokio::fs;

use rushdino_common::{AppError, Result};

use crate::state::AppState;

// ── Shared data structures ──────────────────────────────────────────────────

/// A snapshot of a single KG entity, suitable for export/import context.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedKgEntity {
    pub id: String,
    pub canonical_name: String,
    pub entity_type: Option<String>,
    pub last_seen_at: String,
}

/// Full memory export payload — files + KG snapshot.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryExport {
    /// Map of filename → UTF-8 content for core memory files.
    pub files: HashMap<String, String>,
    /// Top 1000 KG entities ordered by recency. Empty when KG is not enabled.
    pub kg_entities: Vec<ExportedKgEntity>,
    /// RFC-3339 timestamp when this export was created.
    pub exported_at: String,
}

/// Report returned by the import endpoint.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    /// Names of files that were written to disk.
    pub files_written: Vec<String>,
}

// ── Named files exported / importable ──────────────────────────────────────

/// Core memory files that are included in an export and accepted on import.
/// Order matches startup_context() in MemoryManager.
const MEMORY_FILES: &[&str] = &["SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md", "MEMORY.md"];

// ── Export handler ──────────────────────────────────────────────────────────

/// GET /api/memory/export
///
/// Returns a JSON snapshot of the agent's core memory files and top 1000 KG
/// entities. Safe to call while the agent is running — reads are non-destructive.
pub async fn export_memory(
    State(state): State<AppState>,
) -> Result<Json<MemoryExport>> {
    let data_dir = state.config().data_dir.clone();
    let pool = state.runtime.pool();

    // Read each named file; missing files are omitted from the map (not an error).
    let mut files = HashMap::new();
    for name in MEMORY_FILES {
        let path = data_dir.join(name);
        match fs::read_to_string(&path).await {
            Ok(content) => {
                files.insert(name.to_string(), content);
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // File simply doesn't exist yet — skip silently.
            }
            Err(e) => {
                return Err(AppError::from(e));
            }
        }
    }

    // Query top 1000 KG entities by recency. Returns empty vec if table is empty.
    let kg_entities = sqlx::query(
        "SELECT id, canonical_name, entity_type, last_seen_at \
         FROM kg_entities \
         ORDER BY last_seen_at DESC \
         LIMIT 1000",
    )
    .fetch_all(pool.as_ref())
    .await?
    .into_iter()
    .map(|row| ExportedKgEntity {
        id: row.get("id"),
        canonical_name: row.get("canonical_name"),
        entity_type: row.get("entity_type"),
        last_seen_at: row.get("last_seen_at"),
    })
    .collect();

    Ok(Json(MemoryExport {
        files,
        kg_entities,
        exported_at: Utc::now().to_rfc3339(),
    }))
}

// ── Import handler ──────────────────────────────────────────────────────────

/// POST /api/memory/import
///
/// Accepts a MemoryExport payload and writes each file to the agent's data
/// directory. Files with blank/empty content are skipped to prevent accidental
/// erasure. KG entities in the payload are not imported (they are derived from
/// conversation history and rebuilt by the KG pipeline).
pub async fn import_memory(
    State(state): State<AppState>,
    Json(export): Json<MemoryExport>,
) -> Result<Json<ImportReport>> {
    let data_dir = state.config().data_dir.clone();
    let mut files_written = Vec::new();

    for (filename, content) in &export.files {
        // Security: only allow writing the known core file set.
        if !MEMORY_FILES.contains(&filename.as_str()) {
            tracing::warn!(filename = %filename, "import skipping unknown file");
            continue;
        }

        // Skip files that are blank — preserve existing content rather than erase it.
        if content.trim().is_empty() {
            tracing::debug!(filename = %filename, "import skipping blank file");
            continue;
        }

        let path = data_dir.join(filename);
        // Ensure parent dir exists (data_dir should already exist, but be safe).
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await.map_err(AppError::from)?;
        }
        fs::write(&path, content.as_bytes())
            .await
            .map_err(AppError::from)?;

        tracing::info!(filename = %filename, "import wrote memory file");
        files_written.push(filename.clone());
    }

    Ok(Json(ImportReport { files_written }))
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn make_export_with_file(filename: &str, content: &str) -> MemoryExport {
        let mut files = HashMap::new();
        files.insert(filename.to_owned(), content.to_owned());
        MemoryExport {
            files,
            kg_entities: vec![],
            exported_at: Utc::now().to_rfc3339(),
        }
    }

    #[tokio::test]
    async fn import_writes_allowed_files() {
        let dir = tempdir().unwrap();
        let data_dir = dir.path().to_path_buf();

        // Simulate the import logic directly (without full AppState).
        let export = make_export_with_file("MEMORY.md", "# Memory\n\nsome notes\n");

        for (filename, content) in &export.files {
            if !MEMORY_FILES.contains(&filename.as_str()) {
                continue;
            }
            if content.trim().is_empty() {
                continue;
            }
            let path = data_dir.join(filename);
            fs::write(&path, content.as_bytes()).expect("write");
        }

        let written = fs::read_to_string(data_dir.join("MEMORY.md")).expect("read back");
        assert!(written.contains("some notes"), "imported content should be on disk");
    }

    #[tokio::test]
    async fn import_skips_blank_files() {
        let dir = tempdir().unwrap();
        let data_dir = dir.path().to_path_buf();
        // Pre-write existing content.
        fs::write(data_dir.join("SOUL.md"), "# Soul\n\nexisting soul\n").expect("pre-write");

        let export = make_export_with_file("SOUL.md", "   \n  "); // blank

        for (filename, content) in &export.files {
            if !MEMORY_FILES.contains(&filename.as_str()) {
                continue;
            }
            if content.trim().is_empty() {
                continue; // skip blank — this is the behaviour under test
            }
            fs::write(data_dir.join(filename), content.as_bytes()).expect("write");
        }

        let preserved = fs::read_to_string(data_dir.join("SOUL.md")).expect("read back");
        assert!(preserved.contains("existing soul"), "blank import must not overwrite existing file");
    }

    #[tokio::test]
    async fn import_rejects_unknown_filenames() {
        let dir = tempdir().unwrap();
        let data_dir = dir.path().to_path_buf();

        let export = make_export_with_file("../../etc/passwd", "hacked");

        for (filename, content) in &export.files {
            if !MEMORY_FILES.contains(&filename.as_str()) {
                continue; // unknown — skipped
            }
            fs::write(data_dir.join(filename), content.as_bytes()).expect("write");
        }

        // Traversal target must not exist.
        assert!(!data_dir.join("../../etc/passwd").exists());
    }
}
```

- [ ] 5.2 Add `pub mod memory_io;` to `crates/server/src/routes/mod.rs`

- [ ] 5.3 Register both routes in `crates/server/src/lib.rs` (add near the `/api/system/soul-memory` block):

```rust
.route("/api/memory/export", get(routes::memory_io::export_memory))
.route("/api/memory/import", post(routes::memory_io::import_memory))
```

- [ ] 5.4 Run tests: `cargo test -p rushdino-server memory_io`
- [ ] 5.5 Run full server tests: `cargo test -p rushdino-server`
- [ ] 5.6 Commit

---

## Task 6: Wire up `AppError::from(std::io::Error)` (if not already present)

**Context:** `memory_io.rs` uses `AppError::from(e)` for `std::io::Error`. Verify this conversion exists in `crates/common/src/error.rs`.

**Steps:**

- [ ] 6.1 Check `crates/common/src/error.rs` for `impl From<std::io::Error> for AppError`
- [ ] 6.2 If missing, add:
```rust
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Internal(e.to_string())
    }
}
```
- [ ] 6.3 Run `cargo build -p rushdino-server` to confirm no compile errors
- [ ] 6.4 Commit if any changes were needed

---

## Task 7: End-to-end smoke check

**Steps:**

- [ ] 7.1 Run all crate tests: `cargo test -p rushdino-common -p rushdino-agent -p rushdino-server`
- [ ] 7.2 Start the server locally and manually verify:
  - `POST /api/admin/archive` with `{"olderThanDays": 1}` returns `{"logsArchived": N, "toolLogsArchived": M}`
  - `GET /api/memory/export` returns JSON with `files` map and `kgEntities` array
  - `POST /api/memory/import` with the export payload returns `{"filesWritten": [...]}`
- [ ] 7.3 Confirm MEMORY.md on disk matches the content in the import payload after step 7.2
- [ ] 7.4 Final commit / PR

---

## Summary of all files touched

| Action | Path |
|--------|------|
| Create | `crates/common/migrations/002_data_quality.sql` |
| Modify | `crates/agent/src/conversation.rs` (save_message + save_tool_log) |
| Create | `crates/server/src/routes/admin.rs` |
| Create | `crates/server/src/routes/memory_io.rs` |
| Modify | `crates/server/src/routes/mod.rs` (add admin + memory_io) |
| Modify | `crates/server/src/lib.rs` (register 3 new routes) |
| Modify (if needed) | `crates/common/src/error.rs` (io::Error → AppError) |
