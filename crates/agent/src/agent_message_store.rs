//! Persistent store for inter-agent messages backed by SQLite.

use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use rushdino_common::Result;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentMessageState {
    Pending,
    Processing,
    Processed,
    Failed,
}

impl AgentMessageState {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Processing => "processing",
            Self::Processed => "processed",
            Self::Failed => "failed",
        }
    }

    fn from_db(value: &str) -> Self {
        match value {
            "pending" => Self::Pending,
            "processing" => Self::Processing,
            "failed" => Self::Failed,
            _ => Self::Processed,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    pub id: String,
    pub from_agent: String,
    pub to_agent: String,
    pub content: String,
    pub read: bool,
    pub created_at: String,
    pub state: AgentMessageState,
    pub reply_to_message_id: Option<String>,
    pub failure_reason: Option<String>,
}

pub struct AgentMessageStore {
    pool: Arc<SqlitePool>,
    message_notify: Arc<tokio::sync::Notify>,
}

impl AgentMessageStore {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self {
            pool,
            message_notify: Arc::new(tokio::sync::Notify::new()),
        }
    }

    pub fn with_notify(pool: Arc<SqlitePool>, notify: Arc<tokio::sync::Notify>) -> Self {
        Self {
            pool,
            message_notify: notify,
        }
    }

    pub fn message_notify(&self) -> Arc<tokio::sync::Notify> {
        self.message_notify.clone()
    }

    fn map_row(row: sqlx::sqlite::SqliteRow) -> Result<AgentMessage> {
        let state: String = row.try_get("state")?;
        Ok(AgentMessage {
            id: row.try_get("id")?,
            from_agent: row.try_get("from_agent")?,
            to_agent: row.try_get("to_agent")?,
            content: row.try_get("content")?,
            read: row.try_get::<i32, _>("read")? != 0,
            created_at: row.try_get("created_at")?,
            state: AgentMessageState::from_db(&state),
            reply_to_message_id: row.try_get("reply_to_message_id")?,
            failure_reason: row.try_get("failure_reason")?,
        })
    }

    pub async fn send(
        &self,
        from: &str,
        to: &str,
        content: &str,
        state: AgentMessageState,
        reply_to_message_id: Option<&str>,
    ) -> Result<AgentMessage> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO agent_messages \
             (id, from_agent, to_agent, content, read, created_at, state, reply_to_message_id, failure_reason) \
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, NULL)",
        )
        .bind(&id)
        .bind(from)
        .bind(to)
        .bind(content)
        .bind(&now)
        .bind(state.as_str())
        .bind(reply_to_message_id)
        .execute(self.pool.as_ref())
        .await?;

        if state == AgentMessageState::Pending {
            self.message_notify.notify_one();
        }

        Ok(AgentMessage {
            id,
            from_agent: from.to_owned(),
            to_agent: to.to_owned(),
            content: content.to_owned(),
            read: false,
            created_at: now,
            state,
            reply_to_message_id: reply_to_message_id.map(str::to_owned),
            failure_reason: None,
        })
    }

    pub async fn get(&self, message_id: &str) -> Result<Option<AgentMessage>> {
        let row = sqlx::query(
            "SELECT id, from_agent, to_agent, content, read, created_at, state, reply_to_message_id, failure_reason \
             FROM agent_messages WHERE id = ?1",
        )
        .bind(message_id)
        .fetch_optional(self.pool.as_ref())
        .await?;

        row.map(Self::map_row).transpose()
    }

    pub async fn inbox(&self, agent_name: &str, unread_only: bool) -> Result<Vec<AgentMessage>> {
        let query = if unread_only {
            "SELECT id, from_agent, to_agent, content, read, created_at, state, reply_to_message_id, failure_reason \
             FROM agent_messages WHERE to_agent = ?1 AND read = 0 \
             ORDER BY created_at DESC LIMIT 20"
        } else {
            "SELECT id, from_agent, to_agent, content, read, created_at, state, reply_to_message_id, failure_reason \
             FROM agent_messages WHERE to_agent = ?1 \
             ORDER BY created_at DESC LIMIT 20"
        };

        let rows = sqlx::query(query)
            .bind(agent_name)
            .fetch_all(self.pool.as_ref())
            .await?;

        rows.into_iter().map(Self::map_row).collect()
    }

    pub async fn list_all(&self, limit: i64) -> Result<Vec<AgentMessage>> {
        let rows = sqlx::query(
            "SELECT id, from_agent, to_agent, content, read, created_at, state, reply_to_message_id, failure_reason \
             FROM agent_messages ORDER BY created_at DESC LIMIT ?1",
        )
        .bind(limit)
        .fetch_all(self.pool.as_ref())
        .await?;

        rows.into_iter().map(Self::map_row).collect()
    }

    pub async fn claim_next_pending(&self, agent_name: &str) -> Result<Option<AgentMessage>> {
        let row = sqlx::query(
            "SELECT id FROM agent_messages \
             WHERE to_agent = ?1 AND state = 'pending' \
             ORDER BY created_at ASC LIMIT 1",
        )
        .bind(agent_name)
        .fetch_optional(self.pool.as_ref())
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };
        let id: String = row.try_get("id")?;

        let updated = sqlx::query(
            "UPDATE agent_messages SET state = 'processing' \
             WHERE id = ?1 AND state = 'pending'",
        )
        .bind(&id)
        .execute(self.pool.as_ref())
        .await?;

        if updated.rows_affected() == 0 {
            return Ok(None);
        }

        self.get(&id).await
    }

    pub async fn mark_processed(&self, message_id: &str) -> Result<()> {
        sqlx::query(
            "UPDATE agent_messages SET state = 'processed', failure_reason = NULL WHERE id = ?1",
        )
        .bind(message_id)
        .execute(self.pool.as_ref())
        .await?;
        Ok(())
    }

    pub async fn mark_failed(&self, message_id: &str, reason: &str) -> Result<()> {
        sqlx::query(
            "UPDATE agent_messages SET state = 'failed', failure_reason = ?2 WHERE id = ?1",
        )
        .bind(message_id)
        .bind(reason)
        .execute(self.pool.as_ref())
        .await?;
        Ok(())
    }

    pub async fn mark_read(&self, message_id: &str) -> Result<()> {
        sqlx::query("UPDATE agent_messages SET read = 1 WHERE id = ?1")
            .bind(message_id)
            .execute(self.pool.as_ref())
            .await?;
        Ok(())
    }
}

#[cfg(test)]
#[path = "agent_message_store_tests.rs"]
mod tests;
