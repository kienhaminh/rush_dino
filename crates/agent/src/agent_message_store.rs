//! Persistent store for inter-agent messages backed by SQLite.

use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use rushdino_common::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    pub id: String,
    pub from_agent: String,
    pub to_agent: String,
    pub content: String,
    pub read: bool,
    pub created_at: String,
}

pub struct AgentMessageStore {
    pool: Arc<SqlitePool>,
}

impl AgentMessageStore {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }

    pub async fn send(&self, from: &str, to: &str, content: &str) -> Result<AgentMessage> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO agent_messages (id, from_agent, to_agent, content, read, created_at) \
             VALUES (?1, ?2, ?3, ?4, 0, ?5)",
        )
        .bind(&id)
        .bind(from)
        .bind(to)
        .bind(content)
        .bind(&now)
        .execute(self.pool.as_ref())
        .await?;

        Ok(AgentMessage {
            id,
            from_agent: from.to_owned(),
            to_agent: to.to_owned(),
            content: content.to_owned(),
            read: false,
            created_at: now,
        })
    }

    pub async fn inbox(&self, agent_name: &str, unread_only: bool) -> Result<Vec<AgentMessage>> {
        let query = if unread_only {
            "SELECT id, from_agent, to_agent, content, read, created_at \
             FROM agent_messages WHERE to_agent = ?1 AND read = 0 \
             ORDER BY created_at DESC LIMIT 20"
        } else {
            "SELECT id, from_agent, to_agent, content, read, created_at \
             FROM agent_messages WHERE to_agent = ?1 \
             ORDER BY created_at DESC LIMIT 20"
        };

        let rows = sqlx::query(query)
            .bind(agent_name)
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

    pub async fn list_all(&self, limit: i64) -> Result<Vec<AgentMessage>> {
        let rows = sqlx::query(
            "SELECT id, from_agent, to_agent, content, read, created_at \
             FROM agent_messages ORDER BY created_at DESC LIMIT ?1",
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

    pub async fn mark_read(&self, message_id: &str) -> Result<()> {
        sqlx::query("UPDATE agent_messages SET read = 1 WHERE id = ?1")
            .bind(message_id)
            .execute(self.pool.as_ref())
            .await?;
        Ok(())
    }
}
