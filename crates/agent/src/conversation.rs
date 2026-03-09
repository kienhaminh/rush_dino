use std::sync::Arc;

use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::conversation_mapper::{map_conversation, map_message, role_to_str};
use rushdino_common::{
    models::{Conversation, Message, ToolCall},
    AppError, Result,
};

pub struct ConversationManager {
    pool: Arc<SqlitePool>,
}

impl ConversationManager {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }

    pub async fn create_conversation(&self, title: &str) -> Result<Conversation> {
        let now = Utc::now();
        let conversation = Conversation {
            id: Uuid::new_v4().to_string(),
            title: title.to_owned(),
            created_at: now,
            updated_at: now,
        };

        sqlx::query(
            "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(&conversation.id)
        .bind(&conversation.title)
        .bind(conversation.created_at.to_rfc3339())
        .bind(conversation.updated_at.to_rfc3339())
        .execute(self.pool.as_ref())
        .await?;

        Ok(conversation)
    }

    pub async fn create_conversation_with_id(&self, id: &str, title: &str) -> Result<Conversation> {
        let now = Utc::now();
        let conversation = Conversation {
            id: id.to_owned(),
            title: title.to_owned(),
            created_at: now,
            updated_at: now,
        };

        sqlx::query(
            "INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(&conversation.id)
        .bind(&conversation.title)
        .bind(conversation.created_at.to_rfc3339())
        .bind(conversation.updated_at.to_rfc3339())
        .execute(self.pool.as_ref())
        .await?;

        Ok(conversation)
    }

    pub async fn list_conversations(&self) -> Result<Vec<Conversation>> {
        let rows = sqlx::query(
            "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC",
        )
        .fetch_all(self.pool.as_ref())
        .await?;

        rows.into_iter().map(map_conversation).collect()
    }

    pub async fn get_conversation(&self, id: &str) -> Result<Conversation> {
        let row = sqlx::query(
            "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(self.pool.as_ref())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("conversation {id} not found")))?;

        map_conversation(row)
    }

    pub async fn delete_conversation(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM conversations WHERE id = ?1")
            .bind(id)
            .execute(self.pool.as_ref())
            .await?;
        Ok(())
    }

    pub async fn save_message(&self, conversation_id: &str, message: &Message) -> Result<()> {
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
            "INSERT INTO messages (id, conversation_id, role, content, tool_calls, rich_content, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(&message.id)
        .bind(conversation_id)
        .bind(role_to_str(&message.role))
        .bind(&message.content)
        .bind(tool_calls)
        .bind(rich_content)
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

    pub async fn get_messages(&self, conversation_id: &str) -> Result<Vec<Message>> {
        let rows = sqlx::query(
            "SELECT id, role, content, tool_calls, rich_content, created_at FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
        )
        .bind(conversation_id)
        .fetch_all(self.pool.as_ref())
        .await?;

        rows.into_iter().map(map_message).collect()
    }

    pub async fn save_tool_log(
        &self,
        message_id: &str,
        call: &ToolCall,
        result: &str,
        is_error: bool,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO tool_logs (id, message_id, tool_name, arguments, result, is_error, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(message_id)
        .bind(&call.name)
        .bind(call.arguments.to_string())
        .bind(result)
        .bind(i64::from(is_error))
        .bind(Utc::now().to_rfc3339())
        .execute(self.pool.as_ref())
        .await?;

        Ok(())
    }
}
