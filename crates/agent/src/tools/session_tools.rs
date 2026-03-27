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

pub struct SessionDeleteTool {
    conversation: Arc<ConversationManager>,
}

impl SessionDeleteTool {
    pub fn new(conversation: Arc<ConversationManager>) -> Self {
        Self { conversation }
    }
}

#[async_trait]
impl Tool for SessionDeleteTool {
    fn name(&self) -> &str {
        "session_delete"
    }

    fn description(&self) -> &str {
        "Delete a session and all its messages. Call this after a side session has finished its task to clean up."
    }

    fn keywords(&self) -> Vec<&str> {
        vec!["session", "conversation", "delete", "cleanup"]
    }

    fn parameters(&self) -> Value {
        json!({"type": "object", "properties": {"sessionId": {"type": "string"}}, "required": ["sessionId"]})
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let session_id = args
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("sessionId is required".to_owned()))?;
        if session_id == "main" {
            return Err(AppError::Validation(
                "Cannot delete the main session".to_owned(),
            ));
        }
        self.conversation.delete_conversation(session_id).await?;
        Ok(format!("{{\"deleted\": \"{session_id}\"}}"))
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;
    use std::sync::Arc;

    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::SqlitePool;

    use super::*;
    use crate::conversation::ConversationManager;

    async fn make_migrated_pool() -> Arc<SqlitePool> {
        let opts = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .foreign_keys(true);
        let pool = Arc::new(SqlitePool::connect_with(opts).await.unwrap());
        rushdino_common::db::run_migrations(&pool).await.unwrap();
        pool
    }

    // ── SessionCreateTool ────────────────────────────────────────────────────

    /// Verifies that SessionCreateTool creates a new user-visible session
    /// in the database and returns the session metadata.
    #[tokio::test]
    async fn session_create_tool_creates_new_session() {
        let pool = make_migrated_pool().await;
        let conversation = Arc::new(ConversationManager::new(pool.clone()));
        let tool = SessionCreateTool::new(conversation.clone());

        let result = tool
            .execute(serde_json::json!({"title": "Complex Task Session"}))
            .await;

        assert!(result.is_ok(), "expected Ok, got: {:?}", result);
        let body: serde_json::Value = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(body["title"], "Complex Task Session");
        assert!(body["id"].is_string(), "session id should be a string");

        // The session must appear in the user conversation list.
        let sessions = conversation.list_conversations().await.unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].title, "Complex Task Session");
    }

    /// Verifies that multiple calls each produce distinct sessions (unique IDs).
    #[tokio::test]
    async fn session_create_tool_each_call_produces_unique_session() {
        let pool = make_migrated_pool().await;
        let conversation = Arc::new(ConversationManager::new(pool.clone()));
        let tool = SessionCreateTool::new(conversation.clone());

        let r1 = tool
            .execute(serde_json::json!({"title": "Task A"}))
            .await
            .unwrap();
        let r2 = tool
            .execute(serde_json::json!({"title": "Task B"}))
            .await
            .unwrap();

        let v1: serde_json::Value = serde_json::from_str(&r1).unwrap();
        let v2: serde_json::Value = serde_json::from_str(&r2).unwrap();
        assert_ne!(v1["id"], v2["id"], "each session must have a unique id");

        let sessions = conversation.list_conversations().await.unwrap();
        assert_eq!(sessions.len(), 2);
    }

    /// Verifies that a missing title field returns a validation error.
    #[tokio::test]
    async fn session_create_tool_rejects_missing_title() {
        let pool = make_migrated_pool().await;
        let conversation = Arc::new(ConversationManager::new(pool));
        let tool = SessionCreateTool::new(conversation);

        let result = tool.execute(serde_json::json!({})).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("title"));
    }

    // ── DelegateToAgentTool — new session creation ───────────────────────────

    /// Verifies that delegating to a valid agent creates a new isolated
    /// agent conversation (kind = 'agent') in the database, even though the
    /// react loop itself fails because the provider URL is unreachable.
    ///
    /// This proves the contract: every delegation spawns a fresh session so
    /// the sub-agent's history is independently persisted and traceable.
    #[tokio::test]
    async fn delegate_tool_creates_agent_session_for_complex_task() {
        use crate::agent_manager::{AgentManager, AgentTemplate};
        use crate::agent_task_memory::AgentTaskMemory;
        use crate::tool_registry::{SessionToolContext, ToolRegistry};
        use crate::tools::delegate_to_agent::DelegateToAgentTool;
        use rushdino_providers::CompletionsProvider;

        let dir =
            std::env::temp_dir().join(format!("test-sess-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        // Shared DB with full schema so conversation inserts succeed.
        let pool = make_migrated_pool().await;
        let conversation = Arc::new(ConversationManager::new(pool.clone()));

        // Register a valid agent template.
        let manager = Arc::new(AgentManager::new(dir.clone()));
        manager
            .save(&AgentTemplate {
                name: "researcher".to_owned(),
                description: "Researcher".to_owned(),
                system_prompt: "You are a researcher.".to_owned(),
                icon: None,
                tools: None,
                color: None,
                model: None,
                claims_tasks: false,
                sandbox_policy: None,
            })
            .unwrap();

        // Alive Arc references so the Weak upgrades succeed inside execute().
        let registry = Arc::new(ToolRegistry::new());
        let session_ctx = Arc::new(SessionToolContext::new(vec![], &[]));

        // Dummy provider that cannot connect — react loop will fail after the
        // conversation row is already committed to the DB.
        let provider = Arc::new(rushdino_providers::Provider::Ollama(
            CompletionsProvider::new(
                "http://localhost:0".to_owned(),
                "noop".to_owned(),
                None,
                Some("ollama".to_owned()),
            ),
        ));

        let tool = DelegateToAgentTool::new(
            manager,
            provider,
            crate::engine::AgentConfig::default(),
            Arc::downgrade(&registry),
            Arc::downgrade(&session_ctx),
            Arc::new(AgentTaskMemory::new(dir.clone())),
            conversation.clone(),
            dir.clone(),
        );

        // Execute — will return an error from the network layer, but the agent
        // conversation must have been committed before that point.
        let _ = tool
            .execute(serde_json::json!({
                "agent_name": "researcher",
                "task": "Compile a comprehensive market analysis report"
            }))
            .await;

        // The agent session must appear in the agent-session list.
        let agent_sessions = conversation.list_agent_conversations().await.unwrap();
        assert_eq!(
            agent_sessions.len(),
            1,
            "exactly one agent session should be created for the delegation"
        );
        assert!(
            agent_sessions[0].title.contains("researcher"),
            "session title should reference the delegated agent name"
        );

        // It must NOT appear in the regular user session list.
        let user_sessions = conversation.list_conversations().await.unwrap();
        assert!(
            user_sessions.is_empty(),
            "agent sessions must not leak into the user session list"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
