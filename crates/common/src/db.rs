use std::{path::Path, time::Duration};

use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    ConnectOptions, SqlitePool,
};

use crate::error::Result;

/// Initialises a SQLite connection pool with performance-tuned pragma settings.
///
/// All pragmas are set via `SqliteConnectOptions` so they are applied at
/// connection-open time (one syscall) rather than as separate async queries
/// after the pool is created. This removes at least 2 extra round-trips from
/// the startup critical path.
///
/// Pragma choices:
/// - `journal_mode = WAL`           — concurrent readers + single writer; durable on crash
/// - `synchronous  = NORMAL`        — safe with WAL; skips `fsync` on every write (default=FULL)
/// - `foreign_keys = ON`            — enforce FK constraints
/// - `busy_timeout = 5000`          — wait up to 5 s instead of failing on lock contention
/// - `cache_size   = -8000`         — 8 MB page cache per connection (negative = KB)
/// - `mmap_size    = 134217728`     — up to 128 MB memory-mapped reads; faster sequential scans
/// - `temp_store   = MEMORY`        — hold temp tables in RAM instead of on disk
pub async fn init_pool(db_path: &Path) -> Result<SqlitePool> {
    if let Some(parent) = db_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .disable_statement_logging()
        // Performance-tuned pragmas applied at connection open time
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5))
        .pragma("cache_size", "-2000") // 2 MB page cache per connection (was 8 MB)
        .pragma("mmap_size", "33554432") // 32 MB memory-mapped I/O (was 128 MB)
        .pragma("temp_store", "memory"); // temp tables stay in RAM

    let pool = SqlitePoolOptions::new()
        .min_connections(1) // keep one connection warm; avoids cold-open on first query
        .max_connections(8) // 8 connections balances RAM and concurrency (was 16)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(options)
        .await?;

    Ok(pool)
}

pub async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

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
