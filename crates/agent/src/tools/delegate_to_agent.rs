use std::sync::{Arc, Weak};

use async_trait::async_trait;
use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use rushdino_common::{
    models::{Message, Role},
    AppError, Result,
};
use rushdino_providers::Provider;

use crate::{
    agent_manager::AgentManager,
    agent_task_memory::AgentTaskMemory,
    conversation::ConversationManager,
    engine::AgentConfig,
    engine_bootstrap::title_from,
    react_loop::run_react_loop,
    tool_registry::{Tool, ToolRegistry},
    tools::shell_exec::{
        current_tool_execution_context, with_tool_execution_context, ToolExecutionContext,
    },
};

/// Maximum nested delegation depth. Prevents infinite recursion when agents
/// delegate to each other in a cycle or when a chain grows too long.
pub const MAX_DELEGATION_DEPTH: u8 = 3;

/// Allows any agent to hand off a task to a named specialist agent.
///
/// Each delegation creates an isolated conversation in the database so the
/// sub-agent's message history is fully persisted and traceable. A [`Weak`]
/// reference to [`ToolRegistry`] is held to avoid a reference cycle:
/// `ToolRegistry → DelegateToAgentTool → ToolRegistry`.
pub struct DelegateToAgentTool {
    agent_manager: Arc<AgentManager>,
    provider: Arc<Provider>,
    config: AgentConfig,
    /// Weak reference prevents a retain-cycle with the registry that owns this tool.
    registry: Weak<ToolRegistry>,
    task_memory: Arc<AgentTaskMemory>,
    conversation: Arc<ConversationManager>,
}

impl DelegateToAgentTool {
    pub fn new(
        agent_manager: Arc<AgentManager>,
        provider: Arc<Provider>,
        config: AgentConfig,
        registry: Weak<ToolRegistry>,
        task_memory: Arc<AgentTaskMemory>,
        conversation: Arc<ConversationManager>,
    ) -> Self {
        Self {
            agent_manager,
            provider,
            config,
            registry,
            task_memory,
            conversation,
        }
    }
}

#[async_trait]
impl Tool for DelegateToAgentTool {
    fn name(&self) -> &str {
        "delegate_to_agent"
    }

    fn description(&self) -> &str {
        "Delegate the current task to a specialist agent. \
         See the Available Agents list in your system prompt."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "agent_name": {
                    "type": "string",
                    "description": "Name of the target agent (e.g. 'researcher', 'code-reviewer')"
                },
                "task": {
                    "type": "string",
                    "description": "The task description to pass to the target agent"
                }
            },
            "required": ["agent_name", "task"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let agent_name = args
            .get("agent_name")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("agent_name is required".to_owned()))?;
        let task = args
            .get("task")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("task is required".to_owned()))?;

        // Read the task-local context once; used both for the depth guard and
        // to propagate session IDs into the child context.
        let parent_ctx = current_tool_execution_context().unwrap_or(ToolExecutionContext {
            session_id: None,
            conversation_id: None,
            run_id: None,
            delegation_depth: 0,
        });
        let current_depth = parent_ctx.delegation_depth;

        // Enforce delegation depth limit to prevent infinite recursion.
        if current_depth >= MAX_DELEGATION_DEPTH {
            return Err(AppError::Agent(format!(
                "max delegation depth ({MAX_DELEGATION_DEPTH}) reached; cannot delegate to {agent_name}"
            )));
        }

        // Load the target agent's template (system prompt, description, etc.).
        let template = self
            .agent_manager
            .get(agent_name)
            .ok_or_else(|| AppError::Agent(format!("unknown agent: {agent_name}")))?;

        // Upgrade the Weak<ToolRegistry> — the registry must still be alive.
        let registry = self
            .registry
            .upgrade()
            .ok_or_else(|| AppError::Agent("tool registry unavailable".to_owned()))?;

        // Inject the agent's task history into the system prompt if available.
        let system_content = match self.task_memory.load_task_log(agent_name) {
            Some(log) => format!(
                "{}\n\n## Your Task History\n\n{}",
                template.system_prompt, log
            ),
            None => template.system_prompt,
        };

        // Create an isolated conversation for this delegation so the sub-agent's
        // message history is persisted and traceable independently.
        let conv_id = Uuid::new_v4();
        let conv_id_str = conv_id.to_string();
        let conv_title = format!("{agent_name}: {}", title_from(task));
        self.conversation
            .create_conversation_with_id(&conv_id_str, &conv_title)
            .await?;

        // Build the initial message list: target system prompt followed by the task.
        let sys_msg = Message {
            id: Uuid::new_v4().to_string(),
            role: Role::System,
            content: system_content,
            tool_calls: None,
            rich_content: None,
            created_at: Utc::now(),
        };
        let user_msg = Message {
            id: Uuid::new_v4().to_string(),
            role: Role::User,
            content: task.to_owned(),
            tool_calls: None,
            rich_content: None,
            created_at: Utc::now(),
        };

        // Persist the opening messages before the loop so they are visible
        // even if the react loop errors out.
        self.conversation
            .save_message(&conv_id_str, &sys_msg)
            .await?;
        self.conversation
            .save_message(&conv_id_str, &user_msg)
            .await?;

        let messages = vec![sys_msg, user_msg];

        // Build the child context: isolated conversation_id (not the parent's),
        // incremented delegation depth, and inherited session_id.
        let child_ctx = ToolExecutionContext {
            session_id: parent_ctx.session_id,
            conversation_id: Some(conv_id_str.clone()),
            run_id: None,
            delegation_depth: current_depth + 1,
        };

        let (response, all_messages) = with_tool_execution_context(
            child_ctx,
            run_react_loop(
                self.provider.clone(),
                registry,
                messages,
                &self.config,
                None,
            ),
        )
        .await?;

        // Persist all messages produced during the react loop. The first two
        // (system + user) were already saved above, so skip them.
        for message in all_messages.iter().skip(2) {
            if let Err(e) = self.conversation.save_message(&conv_id_str, message).await {
                tracing::warn!(
                    agent = agent_name,
                    conv_id = %conv_id_str,
                    error = %e,
                    "failed to persist delegation message"
                );
            }
        }

        // Persist the task + outcome to the agent's memory log. Best-effort only.
        if let Err(e) = self
            .task_memory
            .append_task(agent_name, task, &response.content)
        {
            tracing::warn!(agent = agent_name, error = %e, "failed to write agent task log");
        }

        Ok(response.content)
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, sync::Weak};

    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::SqlitePool;
    use std::str::FromStr;

    use super::*;
    use crate::agent_manager::AgentTemplate;
    use rushdino_providers::OpenAIProvider;

    /// Constructs a dummy provider that will never be called in the error-path
    /// tests below. We use `Provider::Ollama` with a non-resolvable URL so that
    /// if the code somehow reaches the network layer it fails fast instead of
    /// hanging. The tests exercise only the depth-limit and unknown-agent-name
    /// paths, both of which return errors before touching the provider.
    fn make_dummy_provider() -> Arc<Provider> {
        Arc::new(Provider::Ollama(OpenAIProvider::new(
            "http://localhost:0".to_owned(), // port 0 — will never connect
            "noop-model".to_owned(),
            None,
        )))
    }

    /// Creates an in-memory SQLite pool for tests. Error-path tests never reach
    /// the conversation layer, so no migrations are needed.
    async fn make_test_conversation() -> Arc<ConversationManager> {
        let opts = SqliteConnectOptions::from_str("sqlite::memory:").unwrap();
        let pool = Arc::new(SqlitePool::connect_with(opts).await.unwrap());
        Arc::new(ConversationManager::new(pool))
    }

    async fn make_tool_with_manager(dir: &std::path::Path) -> DelegateToAgentTool {
        use crate::agent_task_memory::AgentTaskMemory;

        DelegateToAgentTool {
            agent_manager: Arc::new(AgentManager::new(dir.to_owned())),
            provider: make_dummy_provider(),
            config: AgentConfig::default(),
            // Dead weak reference — tests do not reach run_react_loop.
            registry: Weak::new(),
            task_memory: Arc::new(AgentTaskMemory::new(dir.to_owned())),
            conversation: make_test_conversation().await,
        }
    }

    #[tokio::test]
    async fn returns_error_for_unknown_agent() {
        let dir = std::env::temp_dir().join(format!("test-delegate-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let tool = make_tool_with_manager(&dir).await;

        let result = tool
            .execute(serde_json::json!({
                "agent_name": "nonexistent",
                "task": "do something"
            }))
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("unknown agent"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn respects_max_delegation_depth() {
        let dir = std::env::temp_dir().join(format!("test-depth-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let manager = Arc::new(AgentManager::new(dir.clone()));

        // Save a valid agent so the lookup succeeds; the depth check fires first.
        manager
            .save(&AgentTemplate {
                name: "researcher".to_owned(),
                description: "Researcher".to_owned(),
                system_prompt: "You are a researcher.".to_owned(),
                icon: None,
                model: None,
                tools: None,
                color: None,
            })
            .unwrap();

        let tool = DelegateToAgentTool {
            agent_manager: manager,
            provider: make_dummy_provider(),
            config: AgentConfig::default(),
            registry: Weak::new(),
            task_memory: Arc::new(crate::agent_task_memory::AgentTaskMemory::new(dir.clone())),
            conversation: make_test_conversation().await,
        };

        // Set the context to the maximum depth already reached.
        let ctx = ToolExecutionContext {
            session_id: None,
            conversation_id: None,
            delegation_depth: MAX_DELEGATION_DEPTH,
            run_id: None,
        };

        let result = with_tool_execution_context(
            ctx,
            tool.execute(serde_json::json!({
                "agent_name": "researcher",
                "task": "find stuff"
            })),
        )
        .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("max delegation depth"));
        let _ = fs::remove_dir_all(&dir);
    }
}
