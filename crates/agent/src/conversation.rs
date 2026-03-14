use std::sync::Arc;

use chrono::Utc;
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::conversation_mapper::{map_conversation, map_message, role_to_str};
use rushdino_common::{
    models::{Conversation, Message, ToolCall},
    AppError, Result,
};

#[derive(Debug, Clone)]
pub struct ConversationRecord {
    pub conversation: Conversation,
    pub archived_at: Option<chrono::DateTime<Utc>>,
}

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
            "INSERT INTO conversations (id, title, created_at, updated_at, archived_at) VALUES (?1, ?2, ?3, ?4, NULL)",
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
            "INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at, archived_at) VALUES (?1, ?2, ?3, ?4, NULL)",
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

    pub async fn get_conversation_record(&self, id: &str) -> Result<ConversationRecord> {
        let row = sqlx::query(
            "SELECT id, title, created_at, updated_at, archived_at FROM conversations WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(self.pool.as_ref())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("conversation {id} not found")))?;

        let archived_at = row
            .try_get::<Option<String>, _>("archived_at")?
            .map(|value| crate::conversation_mapper::parse_ts(value.as_str()))
            .transpose()?;
        let conversation = map_conversation(row)?;

        Ok(ConversationRecord {
            conversation,
            archived_at,
        })
    }

    pub async fn delete_conversation(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM conversations WHERE id = ?1")
            .bind(id)
            .execute(self.pool.as_ref())
            .await?;
        Ok(())
    }

    pub async fn reset_conversation(&self, id: &str) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        let updated = Utc::now().to_rfc3339();
        sqlx::query("DELETE FROM messages WHERE conversation_id = ?1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        let result = sqlx::query("UPDATE conversations SET updated_at = ?1 WHERE id = ?2")
            .bind(updated)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("conversation {id} not found")));
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn archive_conversation(&self, id: &str) -> Result<ConversationRecord> {
        let archived_at = Utc::now().to_rfc3339();
        let result = sqlx::query("UPDATE conversations SET archived_at = ?1, updated_at = ?1 WHERE id = ?2")
            .bind(&archived_at)
            .bind(id)
            .execute(self.pool.as_ref())
            .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("conversation {id} not found")));
        }
        self.get_conversation_record(id).await
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

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use rushdino_common::models::{Message, Role};

    use super::*;

    async fn setup_manager() -> ConversationManager {
        let pool = SqlitePool::connect(":memory:").await.expect("memory db");
        for statement in include_str!("../../common/migrations/001_init.sql").split(';') {
            let sql = statement.trim();
            if sql.is_empty() {
                continue;
            }
            sqlx::query(sql)
                .execute(&pool)
                .await
                .expect("run init migration");
        }
        for statement in include_str!("../../common/migrations/008_messages_rich_content.sql").split(';') {
            let sql = statement.trim();
            if sql.is_empty() {
                continue;
            }
            let _ = sqlx::query(sql).execute(&pool).await;
        }
        for statement in include_str!("../../common/migrations/010_cron_sessions_workspace.sql").split(';') {
            let sql = statement.trim();
            if sql.is_empty() {
                continue;
            }
            let _ = sqlx::query(sql).execute(&pool).await;
        }
        ConversationManager::new(Arc::new(pool))
    }

    #[tokio::test]
    async fn archive_and_reset_preserve_conversation_record() {
        let manager = setup_manager().await;
        let conversation = manager
            .create_conversation("Example")
            .await
            .expect("create conversation");
        manager
            .save_message(
                &conversation.id,
                &Message {
                    id: Uuid::new_v4().to_string(),
                    role: Role::User,
                    content: "hello".to_owned(),
                    tool_calls: None,
                    rich_content: None,
                    created_at: Utc::now(),
                },
            )
            .await
            .expect("save message");

        manager
            .reset_conversation(&conversation.id)
            .await
            .expect("reset conversation");
        let messages = manager
            .get_messages(&conversation.id)
            .await
            .expect("read messages after reset");
        assert!(messages.is_empty());

        let archived = manager
            .archive_conversation(&conversation.id)
            .await
            .expect("archive conversation");
        assert!(archived.archived_at.is_some());
        assert_eq!(archived.conversation.id, conversation.id);
    }
}
