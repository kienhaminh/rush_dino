//! Sessions list tool — list gateway sessions (channel + sender → conversation).
//! Ported from OpenClaw's sessions_list tool.

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use rushdino_common::Result;

use crate::tool_registry::Tool;

pub struct SessionsListTool {
    pool: Arc<SqlitePool>,
}

impl SessionsListTool {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl Tool for SessionsListTool {
    fn name(&self) -> &str {
        "sessions_list"
    }

    fn description(&self) -> &str {
        "List gateway sessions (channel_id, sender_id, conversation_id, last_active)."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "limit": {"type": "number", "description": "Max sessions to return (1-100).", "minimum": 1}
            }
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let limit = args
            .get("limit")
            .and_then(Value::as_u64)
            .map(|n| n as i64)
            .unwrap_or(50)
            .clamp(1, 100);

        let rows = sqlx::query_as::<_, (String, String, String, String)>(
            "SELECT channel_id, sender_id, conversation_id, last_active \
             FROM gateway_sessions \
             ORDER BY last_active DESC \
             LIMIT ?",
        )
        .bind(limit)
        .fetch_all(self.pool.as_ref())
        .await?;

        let sessions: Vec<Value> = rows
            .into_iter()
            .map(|(channel_id, sender_id, conversation_id, last_active)| {
                json!({
                    "channel_id": channel_id,
                    "sender_id": sender_id,
                    "conversation_id": conversation_id,
                    "last_active": last_active,
                    "key": format!("{}:{}", channel_id, sender_id)
                })
            })
            .collect();

        let result = json!({
            "count": sessions.len(),
            "sessions": sessions
        });

        serde_json::to_string_pretty(&result)
            .map_err(|e| rushdino_common::AppError::Agent(e.to_string()))
    }
}
