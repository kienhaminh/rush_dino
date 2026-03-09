//! Session status tool — show metadata about a conversation.
//! Ported from OpenClaw's session_status tool (simplified).

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::conversation::ConversationManager;
use crate::tool_registry::Tool;

pub struct SessionStatusTool {
    conversation: Arc<ConversationManager>,
}

impl SessionStatusTool {
    pub fn new(conversation: Arc<ConversationManager>) -> Self {
        Self { conversation }
    }
}

#[async_trait]
impl Tool for SessionStatusTool {
    fn name(&self) -> &str {
        "session_status"
    }

    fn description(&self) -> &str {
        "Show metadata for a conversation: title, message count, last activity. Use sessions_list to find conversation IDs."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "conversationId": {
                    "type": "string",
                    "description": "Conversation ID (from sessions_list)."
                }
            },
            "required": ["conversationId"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let conversation_id = args
            .get("conversationId")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("conversationId is required".to_owned()))?;

        let conv = self
            .conversation
            .get_conversation(conversation_id)
            .await
            .map_err(|e| AppError::NotFound(format!("conversation not found: {e}")))?;

        let messages = self
            .conversation
            .get_messages_with_limit(conversation_id, Some(3))
            .await
            .unwrap_or_default();

        let last_message = messages.last().map(|m| {
            let content = if m.content.len() > 120 {
                format!("{}…", &m.content[..120])
            } else {
                m.content.clone()
            };
            json!({
                "role": format!("{:?}", m.role).to_lowercase(),
                "content": content,
                "created_at": m.created_at.to_rfc3339()
            })
        });

        let result = json!({
            "conversationId": conv.id,
            "title": conv.title,
            "created_at": conv.created_at.to_rfc3339(),
            "updated_at": conv.updated_at.to_rfc3339(),
            "messageCount": messages.len(),
            "lastMessage": last_message
        });

        serde_json::to_string_pretty(&result)
            .map_err(|e| AppError::Agent(e.to_string()))
    }
}
