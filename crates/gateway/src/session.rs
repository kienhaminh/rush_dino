use serde::Serialize;
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use rushdino_common::Result;

/// Manages the mapping of (channel_id, sender_id) → conversation_id in SQLite.
/// Each unique sender on each channel gets a persistent conversation context.
pub struct SessionManager {
    pool: SqlitePool,
}

#[derive(Debug, Clone, Serialize)]
pub struct GatewaySessionRecord {
    pub id: String,
    pub channel_id: String,
    pub sender_id: String,
    pub conversation_id: String,
    pub last_active: String,
    pub last_run_id: Option<String>,
    pub last_delivery_at: Option<String>,
    pub last_error: Option<String>,
}

impl SessionManager {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Return the existing gateway session for this sender, or atomically create a new session.
    ///
    /// Uses INSERT OR IGNORE to avoid a TOCTOU race when two messages from the same
    /// (channel_id, sender_id) pair arrive concurrently — both callers will see the
    /// same conversation_id regardless of which INSERT won.
    pub async fn get_or_create(
        &self,
        channel_id: &str,
        sender_id: &str,
    ) -> Result<GatewaySessionRecord> {
        let session_id = Uuid::new_v4().to_string();
        let conversation_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        // Atomic insert: if the row already exists the IGNORE silently skips it.
        sqlx::query(
            "INSERT OR IGNORE INTO gateway_sessions \
             (id, channel_id, sender_id, conversation_id, last_active) \
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&session_id)
        .bind(channel_id)
        .bind(sender_id)
        .bind(&conversation_id)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "UPDATE gateway_sessions SET last_active = ? \
             WHERE channel_id = ? AND sender_id = ?",
        )
        .bind(&now)
        .bind(channel_id)
        .bind(sender_id)
        .execute(&self.pool)
        .await?;

        self.get_by_channel_sender(channel_id, sender_id).await
    }

    pub async fn list_sessions(&self, limit: i64) -> Result<Vec<GatewaySessionRecord>> {
        let rows = sqlx::query(
            "SELECT id, channel_id, sender_id, conversation_id, last_active, \
                last_run_id, last_delivery_at, last_error \
             FROM gateway_sessions \
             ORDER BY last_active DESC \
             LIMIT ?1",
        )
        .bind(limit.max(1))
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(map_session_row).collect())
    }

    pub async fn note_run_started(&self, session_id: &str, run_id: &str) -> Result<()> {
        sqlx::query(
            "UPDATE gateway_sessions \
             SET last_run_id = ?2, last_error = NULL \
             WHERE id = ?1",
        )
        .bind(session_id)
        .bind(run_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn note_delivery_result(
        &self,
        session_id: &str,
        run_id: &str,
        error: Option<&str>,
    ) -> Result<()> {
        let delivered_at = if error.is_none() {
            Some(chrono::Utc::now().to_rfc3339())
        } else {
            None
        };
        sqlx::query(
            "UPDATE gateway_sessions \
             SET last_run_id = ?2, last_delivery_at = COALESCE(?3, last_delivery_at), last_error = ?4 \
             WHERE id = ?1",
        )
        .bind(session_id)
        .bind(run_id)
        .bind(delivered_at)
        .bind(error)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn reset_session(&self, session_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM gateway_sessions WHERE id = ?1")
            .bind(session_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_by_id(&self, session_id: &str) -> Result<Option<GatewaySessionRecord>> {
        let row = sqlx::query(
            "SELECT id, channel_id, sender_id, conversation_id, last_active, \
                last_run_id, last_delivery_at, last_error \
             FROM gateway_sessions \
             WHERE id = ?1",
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(map_session_row))
    }

    async fn get_by_channel_sender(
        &self,
        channel_id: &str,
        sender_id: &str,
    ) -> Result<GatewaySessionRecord> {
        let row = sqlx::query(
            "SELECT id, channel_id, sender_id, conversation_id, last_active, \
                last_run_id, last_delivery_at, last_error \
             FROM gateway_sessions \
             WHERE channel_id = ?1 AND sender_id = ?2",
        )
        .bind(channel_id)
        .bind(sender_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(map_session_row(row))
    }
}

fn map_session_row(row: sqlx::sqlite::SqliteRow) -> GatewaySessionRecord {
    GatewaySessionRecord {
        id: row.get("id"),
        channel_id: row.get("channel_id"),
        sender_id: row.get("sender_id"),
        conversation_id: row.get("conversation_id"),
        last_active: row.get("last_active"),
        last_run_id: row.get("last_run_id"),
        last_delivery_at: row.get("last_delivery_at"),
        last_error: row.get("last_error"),
    }
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;

    use rushdino_common::db::run_migrations;

    use super::*;

    async fn create_manager() -> SessionManager {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect sqlite");
        run_migrations(&pool).await.expect("run migrations");
        SessionManager::new(pool)
    }

    #[tokio::test]
    async fn get_or_create_reuses_existing_session_and_refreshes_last_active() {
        let manager = create_manager().await;
        let first = manager
            .get_or_create("telegram", "chat-1")
            .await
            .expect("first session");
        tokio::time::sleep(tokio::time::Duration::from_millis(5)).await;
        let second = manager
            .get_or_create("telegram", "chat-1")
            .await
            .expect("second session");

        assert_eq!(first.id, second.id);
        assert_eq!(first.conversation_id, second.conversation_id);
        assert!(second.last_active >= first.last_active);
    }

    #[tokio::test]
    async fn reset_session_forces_new_conversation_on_next_message() {
        let manager = create_manager().await;
        let first = manager
            .get_or_create("slack", "channel-1")
            .await
            .expect("first session");
        manager
            .reset_session(&first.id)
            .await
            .expect("reset session");

        let second = manager
            .get_or_create("slack", "channel-1")
            .await
            .expect("new session");

        assert_ne!(first.id, second.id);
        assert_ne!(first.conversation_id, second.conversation_id);
    }
}
