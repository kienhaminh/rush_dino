//! Sessions history tool — fetch message history for a conversation.
//! Ported from OpenClaw's sessions_history tool.

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::Result;

use crate::conversation::ConversationManager;
use crate::conversation_mapper::role_to_str;
use crate::tool_registry::Tool;

const MAX_MESSAGES: i64 = 50;
const MAX_BYTES: usize = 80 * 1024;

pub struct SessionsHistoryTool {
    conversation: Arc<ConversationManager>,
}

impl SessionsHistoryTool {
    pub fn new(conversation: Arc<ConversationManager>) -> Self {
        Self { conversation }
    }
}

#[async_trait]
impl Tool for SessionsHistoryTool {
    fn name(&self) -> &str {
        "sessions_history"
    }

    fn description(&self) -> &str {
        "Fetch message history for a conversation. Use conversation_id from sessions_list."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "conversationId": {"type": "string", "description": "Conversation ID (from sessions_list)."},
                "limit": {"type": "number", "description": "Max messages to return (1-50).", "minimum": 1}
            },
            "required": ["conversationId"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let conversation_id = args
            .get("conversationId")
            .and_then(Value::as_str)
            .ok_or_else(|| rushdino_common::AppError::Validation("conversationId is required".to_owned()))?;

        let limit = args
            .get("limit")
            .and_then(Value::as_u64)
            .map(|n| n as i64)
            .unwrap_or(MAX_MESSAGES)
            .clamp(1, MAX_MESSAGES);

        let messages = self
            .conversation
            .get_messages_with_limit(conversation_id, Some(limit))
            .await?;

        let items: Vec<Value> = messages
            .into_iter()
            .map(|m| {
                json!({
                    "id": m.id,
                    "role": role_to_str(&m.role),
                    "content": m.content,
                    "created_at": m.created_at.to_rfc3339()
                })
            })
            .collect();

        let mut json_str = serde_json::to_string_pretty(&json!({
            "conversationId": conversation_id,
            "messages": items,
            "count": items.len()
        }))
        .map_err(|e| rushdino_common::AppError::Agent(e.to_string()))?;

        if json_str.len() > MAX_BYTES {
            json_str = serde_json::to_string_pretty(&json!({
                "conversationId": conversation_id,
                "truncated": true,
                "error": format!("History too large ({} bytes, max {})", json_str.len(), MAX_BYTES),
                "messages": []
            }))
            .map_err(|e| rushdino_common::AppError::Agent(e.to_string()))?;
        }

        Ok(json_str)
    }
}
