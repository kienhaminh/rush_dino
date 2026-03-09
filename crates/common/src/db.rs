use std::path::Path;

use sqlx::{sqlite::SqliteConnectOptions, ConnectOptions, SqlitePool};

use crate::error::Result;

pub async fn init_pool(db_path: &Path) -> Result<SqlitePool> {
    if let Some(parent) = db_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .disable_statement_logging();

    let pool = SqlitePool::connect_with(options).await?;
    sqlx::query("PRAGMA journal_mode=WAL;")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA foreign_keys=ON;")
        .execute(&pool)
        .await?;
    Ok(pool)
}

pub async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    // Keep this wrapper in sync with `crates/common/migrations/*` so SQLx
    // re-embeds newly added migrations into downstream crates during rebuilds.
    let _embedded_schema_markers = (
        include_str!("../migrations/006_runtime_runs.sql"),
        include_str!("../migrations/007_gateway_runtime_metadata.sql"),
        include_str!("../migrations/008_messages_rich_content.sql"),
        include_str!("../migrations/009_channel_pairing.sql"),
    );
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}
