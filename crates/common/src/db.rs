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
        .pragma("cache_size", "-8000") // 8 MB page cache per connection
        .pragma("mmap_size", "134217728") // 128 MB memory-mapped I/O
        .pragma("temp_store", "memory"); // temp tables stay in RAM

    let pool = SqlitePoolOptions::new()
        .min_connections(1) // keep one connection warm; avoids cold-open on first query
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(options)
        .await?;

    Ok(pool)
}

pub async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    let _embedded_schema_markers = (
        include_str!("../migrations/001_init.sql"),
        include_str!("../migrations/002_sandbox_audit.sql"),
        include_str!("../migrations/003_usage_metrics_auth_method.sql"),
        include_str!("../migrations/004_kanban_tasks.sql"),
    );
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}
