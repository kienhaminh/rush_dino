use std::sync::{Arc, Weak};

use async_trait::async_trait;
use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use rushdino_common::{
    models::{Message, Role},
    AppError, Result,
};
use rushdino_providers::{types::ChatResponse, Provider};

use crate::{
    conversation::ConversationManager,
    engine::AgentConfig,
    engine_bootstrap::system_message,
    memory::MemoryManager,
    react_loop::run_react_loop,
    skill_manager::SkillManager,
    system_prompt::SkillEntry,
    tool_registry::{SessionToolContext, Tool, ToolRegistry},
    tools::shell_exec::{
        current_tool_execution_context, with_tool_execution_context, ToolExecutionContext,
    },
};

struct SessionChatDeps {
    conversation: Arc<ConversationManager>,
    provider: Arc<Provider>,
    registry: Weak<ToolRegistry>,
    session_ctx: Weak<SessionToolContext>,
    memory: Arc<MemoryManager>,
    skill_manager: Arc<SkillManager>,
    config: AgentConfig,
}

async fn run_session_turn(
    deps: &SessionChatDeps,
    conversation_id: &str,
    input: &str,
) -> Result<ChatResponse> {
    let registry = deps
        .registry
        .upgrade()
        .ok_or_else(|| AppError::Agent("tool registry unavailable".to_owned()))?;
    let session_ctx = deps
        .session_ctx
        .upgrade()
        .ok_or_else(|| AppError::Agent("session context unavailable".to_owned()))?;
    let mut messages = deps
        .conversation
        .get_messages(conversation_id)
        .await
        .unwrap_or_default();
    if messages.is_empty() {
        let _ = deps
            .conversation
            .create_conversation_with_id(conversation_id, input)
            .await?;
    }
    let skills = deps.skill_manager
        .list()
        .unwrap_or_default()
        .into_iter()
        .map(|s| SkillEntry {
            name: s.name,
            description: s.description,
        })
        .collect();
    messages.insert(
        0,
        system_message(
            &deps.config,
            deps.memory.as_ref(),
            skills,
            session_ctx.as_ref(),
            &[],
        ),
    );

    let old_len = messages.len();
    let user_msg = Message {
        id: Uuid::new_v4().to_string(),
        role: Role::User,
        content: input.to_owned(),
        tool_calls: None,
        rich_content: None,
        created_at: Utc::now(),
    };
    deps.conversation
        .save_message(conversation_id, &user_msg)
        .await?;
    messages.push(user_msg);

    let parent_ctx = current_tool_execution_context().unwrap_or(ToolExecutionContext {
        session_id: None,
        conversation_id: None,
        run_id: None,
        delegation_depth: 0,
        workspace_override: None,
    });
    let tool_ctx = ToolExecutionContext {
        conversation_id: Some(conversation_id.to_owned()),
        delegation_depth: parent_ctx.delegation_depth.saturating_add(1),
        ..parent_ctx
    };
    let (response, all_messages) = with_tool_execution_context(
        tool_ctx,
        run_react_loop(
            deps.provider.clone(),
            registry,
            session_ctx,
            messages,
            &deps.config,
            None,
        ),
    )
    .await?;
    for message in all_messages.iter().skip(old_len + 1) {
        deps.conversation
            .save_message(conversation_id, message)
            .await?;
    }
    Ok(response)
}

pub struct SessionCreateTool {
    conversation: Arc<ConversationManager>,
}

impl SessionCreateTool {
    pub fn new(conversation: Arc<ConversationManager>) -> Self {
        Self { conversation }
    }
}

#[async_trait]
impl Tool for SessionCreateTool {
    fn name(&self) -> &str {
        "session_create"
    }

    fn description(&self) -> &str {
        "Create a new session/conversation with a human-readable title."
    }

    fn keywords(&self) -> Vec<&str> {
        vec!["session", "conversation", "history"]
    }

    fn parameters(&self) -> Value {
        json!({"type": "object", "properties": {"title": {"type": "string"}}, "required": ["title"]})
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let title = args
            .get("title")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("title is required".to_owned()))?;
        let session = self.conversation.create_conversation(title.trim()).await?;
        serde_json::to_string_pretty(&json!(session)).map_err(|e| AppError::Agent(e.to_string()))
    }
}

pub struct SessionGetTool {
    conversation: Arc<ConversationManager>,
}

impl SessionGetTool {
    pub fn new(conversation: Arc<ConversationManager>) -> Self {
        Self { conversation }
    }
}

#[async_trait]
impl Tool for SessionGetTool {
    fn name(&self) -> &str {
        "session_get"
    }

    fn description(&self) -> &str {
        "Get session metadata and recent messages by session ID."
    }

    fn keywords(&self) -> Vec<&str> {
        vec!["session", "conversation", "history"]
    }

    fn parameters(&self) -> Value {
        json!({"type": "object", "properties": {"sessionId": {"type": "string"}}, "required": ["sessionId"]})
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let session_id = args
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("sessionId is required".to_owned()))?;
        let session = self
            .conversation
            .get_conversation_record(session_id)
            .await?;
        let messages = self.conversation.get_messages(session_id).await?;
        serde_json::to_string_pretty(&json!({
            "session": {
                "id": session.conversation.id,
                "title": session.conversation.title,
                "createdAt": session.conversation.created_at.to_rfc3339(),
                "updatedAt": session.conversation.updated_at.to_rfc3339(),
                "archivedAt": session.archived_at.map(|value| value.to_rfc3339()),
            },
            "messages": messages,
        }))
        .map_err(|e| AppError::Agent(e.to_string()))
    }
}

pub struct SessionSendTool {
    deps: SessionChatDeps,
}

impl SessionSendTool {
    pub fn new(
        conversation: Arc<ConversationManager>,
        provider: Arc<Provider>,
        registry: Weak<ToolRegistry>,
        session_ctx: Weak<SessionToolContext>,
        memory: Arc<MemoryManager>,
        skill_manager: Arc<SkillManager>,
        config: AgentConfig,
    ) -> Self {
        Self {
            deps: SessionChatDeps {
                conversation,
                provider,
                registry,
                session_ctx,
                memory,
                skill_manager,
                config,
            },
        }
    }
}

#[async_trait]
impl Tool for SessionSendTool {
    fn name(&self) -> &str {
        "session_send"
    }

    fn description(&self) -> &str {
        "Send a message into an existing session and wait for the agent reply."
    }

    fn keywords(&self) -> Vec<&str> {
        vec!["session", "conversation", "history"]
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "sessionId": {"type": "string"},
                "message": {"type": "string"}
            },
            "required": ["sessionId", "message"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let session_id = args
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("sessionId is required".to_owned()))?;
        let message = args
            .get("message")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("message is required".to_owned()))?;
        let response = run_session_turn(&self.deps, session_id, message).await?;
        serde_json::to_string_pretty(&json!({
            "sessionId": session_id,
            "reply": response.content,
        }))
        .map_err(|e| AppError::Agent(e.to_string()))
    }
}
