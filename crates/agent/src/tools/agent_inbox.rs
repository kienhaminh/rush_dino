//! Tool for inter-agent messaging — send messages and check inbox.

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{
    agent_manager::AgentManager,
    agent_message_store::{AgentMessageState, AgentMessageStore},
    tool_registry::Tool,
};

pub struct AgentInboxTool {
    store: Arc<AgentMessageStore>,
    agent_manager: Arc<AgentManager>,
}

impl AgentInboxTool {
    pub fn new(store: Arc<AgentMessageStore>, agent_manager: Arc<AgentManager>) -> Self {
        Self {
            store,
            agent_manager,
        }
    }
}

#[async_trait]
impl Tool for AgentInboxTool {
    fn name(&self) -> &str {
        "agent_inbox"
    }

    fn description(&self) -> &str {
        "Send messages to other agents or check your inbox. \
         Use action 'send' to message another agent by name. \
         Use action 'check' to see unread messages in your inbox."
    }


    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["send", "check"],
                    "description": "Action to perform: 'send' a message or 'check' inbox"
                },
                "to": {
                    "type": "string",
                    "description": "Target agent name (required for 'send' action)"
                },
                "content": {
                    "type": "string",
                    "description": "Message content (required for 'send' action)"
                },
                "from": {
                    "type": "string",
                    "description": "Your agent name (required for both actions)"
                }
            },
            "required": ["action", "from"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let action = args
            .get("action")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("action is required".to_owned()))?;
        let from = args
            .get("from")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("from is required".to_owned()))?;

        match action {
            "send" => {
                let to = args.get("to").and_then(Value::as_str).ok_or_else(|| {
                    AppError::Validation("to is required for send action".to_owned())
                })?;
                let content = args.get("content").and_then(Value::as_str).ok_or_else(|| {
                    AppError::Validation("content is required for send action".to_owned())
                })?;

                let target = self
                    .agent_manager
                    .get(to)
                    .ok_or_else(|| AppError::Validation(format!("unknown agent: {to}")))?;
                let initial_state = if target.inbox_enabled {
                    AgentMessageState::Pending
                } else {
                    AgentMessageState::Processed
                };

                let msg = self
                    .store
                    .send(from, to, content, initial_state, None)
                    .await?;
                let status = if initial_state == AgentMessageState::Pending {
                    "queued"
                } else {
                    "sent"
                };
                Ok(format!("Message {status} to {} (id: {})", to, msg.id))
            }
            "check" => {
                let messages = self.store.inbox(from, true).await?;
                if messages.is_empty() {
                    return Ok("No unread messages.".to_owned());
                }

                for msg in &messages {
                    let _ = self.store.mark_read(&msg.id).await;
                }

                let mut output = format!("{} unread message(s):\n\n", messages.len());
                for msg in &messages {
                    output.push_str(&format!(
                        "From: {}\nTime: {}\nState: {}\n{}\n---\n",
                        msg.from_agent,
                        msg.created_at,
                        msg.state.as_str(),
                        msg.content
                    ));
                }
                Ok(output)
            }
            _ => Err(AppError::Validation(format!("unknown action: {action}"))),
        }
    }
}
