//! Sessions spawn tool — create a new isolated conversation and run a task asynchronously.
//! Ported from OpenClaw's sessions_spawn tool.
//!
//! The task is spawned in a background tokio task (fire-and-forget).
//! Use sessions_history to poll for the result.

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
    engine_bootstrap::{system_message, title_from},
    memory::MemoryManager,
    react_loop::run_react_loop,
    tool_registry::{Tool, ToolRegistry},
    tools::shell_exec::{
        current_tool_execution_context, with_tool_execution_context, ToolExecutionContext,
    },
};

/// Maximum delegation depth check before spawning.
const MAX_DEPTH: u8 = 3;

pub struct SessionsSpawnTool {
    conversation: Arc<ConversationManager>,
    provider: Arc<ArcSwap<Provider>>,
    registry: Weak<ToolRegistry>,
    memory: Arc<MemoryManager>,
    agent_manager: Arc<AgentManager>,
    config: AgentConfig,
}

impl SessionsSpawnTool {
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
impl Tool for SessionsSpawnTool {
    fn name(&self) -> &str {
        "sessions_spawn"
    }

    fn description(&self) -> &str {
        "Spawn an isolated conversation and run a task in it asynchronously. Returns a conversationId you can poll with sessions_history. Use for parallel long-running tasks."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "Task description/instructions for the spawned agent."
                },
                "label": {
                    "type": "string",
                    "description": "Optional human-readable label for the conversation."
                }
            },
            "required": ["task"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let task = args
            .get("task")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("task is required".to_owned()))?;
        let label = args
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or_else(|| title_from(task));

        let parent_ctx = current_tool_execution_context().unwrap_or(ToolExecutionContext {
            session_id: None,
            conversation_id: None,
            run_id: None,
            delegation_depth: 0,
        });

        if parent_ctx.delegation_depth >= MAX_DEPTH {
            return Err(AppError::Agent(format!(
                "max delegation depth ({MAX_DEPTH}) reached; cannot spawn new session"
            )));
        }

        let registry = self
            .registry
            .upgrade()
            .ok_or_else(|| AppError::Agent("tool registry unavailable".to_owned()))?;

        let conversation_id = Uuid::new_v4().to_string();
        self.conversation
            .create_conversation_with_id(&conversation_id, label)
            .await?;

        let sys_msg = system_message(&self.config, &self.memory, &self.agent_manager);
        let user_msg = Message {
            id: Uuid::new_v4().to_string(),
            role: Role::User,
            content: task.to_owned(),
            tool_calls: None,
            rich_content: None,
            created_at: Utc::now(),
        };

        self.conversation.save_message(&conversation_id, &sys_msg).await?;
        self.conversation.save_message(&conversation_id, &user_msg).await?;

        let messages = vec![sys_msg, user_msg];
        let child_ctx = ToolExecutionContext {
            conversation_id: Some(conversation_id.clone()),
            delegation_depth: parent_ctx.delegation_depth + 1,
            ..parent_ctx
        };

        // Spawn async background task — fire-and-forget.
        let conv_id_clone = conversation_id.clone();
        let conv_manager = self.conversation.clone();
        let provider_clone = self.provider.load_full();
        let config_clone = self.config.clone();
        tokio::spawn(async move {
            let result = with_tool_execution_context(
                child_ctx,
                run_react_loop(provider_clone, registry, messages, &config_clone, None),
            )
            .await;
            if let Ok((_response, all_messages)) = result {
                // Skip sys + user messages already saved (first 2)
                for msg in all_messages.iter().skip(2) {
                    let _ = conv_manager.save_message(&conv_id_clone, msg).await;
                }
            }
        });

        let result = json!({
            "conversationId": conversation_id,
            "status": "spawned",
            "label": label,
            "message": "Task running in background. Use sessions_history to poll for results."
        });

        serde_json::to_string_pretty(&result)
            .map_err(|e| AppError::Agent(e.to_string()))
    }
}
