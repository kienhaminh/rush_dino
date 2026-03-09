//! Sessions send tool — send a message to an existing conversation and get a reply.
//! Ported from OpenClaw's sessions_send tool.
//!
//! Unlike spawn_sub_agent (which is fire-and-forget), sessions_send runs a full
//! synchronous agent ReAct loop in the target conversation and returns the reply.

use std::sync::{Arc, Weak};

use arc_swap::ArcSwap;
use async_trait::async_trait;
use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use rushdino_common::{models::{Message, Role}, AppError, Result};
use rushdino_providers::Provider;

use crate::{
    agent_manager::AgentManager,
    conversation::ConversationManager,
    engine::AgentConfig,
    engine_bootstrap::system_message,
    memory::MemoryManager,
    react_loop::run_react_loop,
    tool_registry::{Tool, ToolRegistry},
    tools::shell_exec::{
        current_tool_execution_context, with_tool_execution_context, ToolExecutionContext,
    },
};

/// Maximum delegation depth — same as delegate_to_agent to keep it consistent.
const MAX_DEPTH: u8 = 3;

pub struct SessionsSendTool {
    conversation: Arc<ConversationManager>,
    provider: Arc<ArcSwap<Provider>>,
    registry: Weak<ToolRegistry>,
    memory: Arc<MemoryManager>,
    agent_manager: Arc<AgentManager>,
    config: AgentConfig,
}

impl SessionsSendTool {
    pub fn new(
        conversation: Arc<ConversationManager>,
        provider: Arc<ArcSwap<Provider>>,
        registry: Weak<ToolRegistry>,
        memory: Arc<MemoryManager>,
        agent_manager: Arc<AgentManager>,
        config: AgentConfig,
    ) -> Self {
        Self { conversation, provider, registry, memory, agent_manager, config }
    }
}

#[async_trait]
impl Tool for SessionsSendTool {
    fn name(&self) -> &str {
        "sessions_send"
    }

    fn description(&self) -> &str {
        "Send a message to an existing conversation (by conversationId) and wait for the agent reply. Use sessions_list to find conversation IDs."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "conversationId": {
                    "type": "string",
                    "description": "Target conversation ID (from sessions_list)."
                },
                "message": {
                    "type": "string",
                    "description": "Message to send."
                }
            },
            "required": ["conversationId", "message"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let conversation_id = args
            .get("conversationId")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("conversationId is required".to_owned()))?;
        let message = args
            .get("message")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("message is required".to_owned()))?;

        let parent_ctx = current_tool_execution_context().unwrap_or(ToolExecutionContext {
            session_id: None,
            conversation_id: None,
            run_id: None,
            delegation_depth: 0,
        });

        if parent_ctx.delegation_depth >= MAX_DEPTH {
            return Err(AppError::Agent(format!(
                "max delegation depth ({MAX_DEPTH}) reached; cannot send to conversation"
            )));
        }

        let registry = self
            .registry
            .upgrade()
            .ok_or_else(|| AppError::Agent("tool registry unavailable".to_owned()))?;

        let mut messages = self
            .conversation
            .get_messages(conversation_id)
            .await
            .unwrap_or_default();

        if messages.is_empty() {
            messages.push(system_message(&self.config, &self.memory, &self.agent_manager));
        }

        let user_msg = Message {
            id: Uuid::new_v4().to_string(),
            role: Role::User,
            content: message.to_owned(),
            tool_calls: None,
            rich_content: None,
            created_at: Utc::now(),
        };
        self.conversation.save_message(conversation_id, &user_msg).await?;
        let old_len = messages.len();
        messages.push(user_msg);

        let child_ctx = ToolExecutionContext {
            conversation_id: Some(conversation_id.to_owned()),
            delegation_depth: parent_ctx.delegation_depth + 1,
            ..parent_ctx
        };

        let (response, all_messages) = with_tool_execution_context(
            child_ctx,
            run_react_loop(
                self.provider.load_full(),
                registry,
                messages,
                &self.config,
                None,
            ),
        )
        .await?;

        for msg in all_messages.iter().skip(old_len + 1) {
            let _ = self.conversation.save_message(conversation_id, msg).await;
        }

        let result = json!({
            "conversationId": conversation_id,
            "status": "ok",
            "reply": response.content
        });

        serde_json::to_string_pretty(&result)
            .map_err(|e| AppError::Agent(e.to_string()))
    }
}
