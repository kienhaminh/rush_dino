use sqlx::SqlitePool;
use uuid::Uuid;

use rushdino_common::Result;

/// Manages the mapping of (channel_id, sender_id) → conversation_id in SQLite.
/// Each unique sender on each channel gets a persistent conversation context.
pub struct SessionManager {
    pool: SqlitePool,
}

impl SessionManager {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Return the existing conversation_id for this sender, or atomically create a new session.
    ///
    /// Uses INSERT OR IGNORE to avoid a TOCTOU race when two messages from the same
    /// (channel_id, sender_id) pair arrive concurrently — both callers will see the
    /// same conversation_id regardless of which INSERT won.
    pub async fn get_or_create(&self, channel_id: &str, sender_id: &str) -> Result<String> {
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

        // Fetch the winning row's conversation_id (may differ from our uuid if we lost the race).
        let actual: String = sqlx::query_scalar(
            "SELECT conversation_id FROM gateway_sessions \
             WHERE channel_id = ? AND sender_id = ?",
        )
        .bind(channel_id)
        .bind(sender_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(actual)
    }
}
