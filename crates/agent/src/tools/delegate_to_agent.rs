use std::{
    path::PathBuf,
    sync::{Arc, Weak},
};

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
    tool_registry::{SessionToolContext, Tool, ToolRegistry},
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
/// Tools that are always available to every delegated agent, regardless of
/// the agent template's `tools` field.
const AGENT_BASE_TOOLS: &[&str] = &["delegate", "message", "tool_search"];

/// Parses the agent template's `tools` field (comma-separated) into a list of
/// tool names, merging in the always-available base tools.
///
/// Returns an empty vec when `tools` is `None`, which signals "unrestricted" —
/// the agent gets access to all tools in the parent pool.
fn parse_tool_list(tools: &Option<String>) -> Vec<String> {
    let Some(raw) = tools else {
        return Vec::new();
    };
    let mut names: Vec<String> = raw
        .split(',')
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .collect();
    for &base in AGENT_BASE_TOOLS {
        if !names.iter().any(|n| n == base) {
            names.push(base.to_owned());
        }
    }
    names
}

pub struct DelegateToAgentTool {
    agent_manager: Arc<AgentManager>,
    provider: Arc<Provider>,
    config: AgentConfig,
    /// Weak reference prevents a retain-cycle with the registry that owns this tool.
    registry: Weak<ToolRegistry>,
    /// Weak reference prevents a retain-cycle with SessionToolContext that indirectly
    /// owns this tool via the tool pool.
    session_ctx: Weak<SessionToolContext>,
    task_memory: Arc<AgentTaskMemory>,
    conversation: Arc<ConversationManager>,
    /// Home directory (~/.rushdino) used to create per-agent workspace dirs.
    home_dir: PathBuf,
}

impl DelegateToAgentTool {
    pub fn new(
        agent_manager: Arc<AgentManager>,
        provider: Arc<Provider>,
        config: AgentConfig,
        registry: Weak<ToolRegistry>,
        session_ctx: Weak<SessionToolContext>,
        task_memory: Arc<AgentTaskMemory>,
        conversation: Arc<ConversationManager>,
        home_dir: PathBuf,
    ) -> Self {
        Self {
            agent_manager,
            provider,
            config,
            registry,
            session_ctx,
            task_memory,
            conversation,
            home_dir,
        }
    }
}

#[async_trait]
impl Tool for DelegateToAgentTool {
    fn name(&self) -> &str {
        "delegate"
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
            workspace_override: None,
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
        let session_ctx = self
            .session_ctx
            .upgrade()
            .ok_or_else(|| AppError::Agent("session context unavailable".to_owned()))?;

        // --- Per-agent tool scoping ---
        // Parse the template's `tools` field and create a filtered SessionToolContext.
        let allowed = parse_tool_list(&template.tools);
        let scoped_ctx: Arc<SessionToolContext> = if allowed.is_empty() {
            // Unrestricted agent — reuse parent's full pool.
            session_ctx.clone()
        } else {
            let refs: Vec<&str> = allowed.iter().map(String::as_str).collect();
            Arc::new(SessionToolContext::scoped(session_ctx.pool_tools(), &refs))
        };

        // --- Per-agent model override ---
        let child_config = if template.model.is_some() {
            AgentConfig {
                model_override: template.model.clone(),
                ..self.config.clone()
            }
        } else {
            self.config.clone()
        };

        // --- Per-agent workspace isolation ---
        let agent_workspace = self.home_dir.join("agents").join(agent_name).join("workspace");
        std::fs::create_dir_all(&agent_workspace).map_err(|e| {
            AppError::Agent(format!("failed to create agent workspace: {e}"))
        })?;

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

        // Build the child context: isolated conversation, workspace, incremented depth.
        let child_ctx = ToolExecutionContext {
            session_id: parent_ctx.session_id,
            conversation_id: Some(conv_id_str.clone()),
            run_id: None,
            delegation_depth: current_depth + 1,
            workspace_override: Some(agent_workspace),
        };

        let (response, all_messages) = with_tool_execution_context(
            child_ctx,
            run_react_loop(
                self.provider.clone(),
                registry,
                scoped_ctx,
                messages,
                &child_config,
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
    use rushdino_providers::CompletionsProvider;

    /// Constructs a dummy provider that will never be called in the error-path
    /// tests below. We use `Provider::Ollama` with a non-resolvable URL so that
    /// if the code somehow reaches the network layer it fails fast instead of
    /// hanging. The tests exercise only the depth-limit and unknown-agent-name
    /// paths, both of which return errors before touching the provider.
    fn make_dummy_provider() -> Arc<Provider> {
        Arc::new(Provider::Ollama(CompletionsProvider::new(
            "http://localhost:0".to_owned(), // port 0 — will never connect
            "noop-model".to_owned(),
            None,
            Some("ollama".to_owned()),
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
            // Dead weak references — tests do not reach run_react_loop.
            registry: Weak::new(),
            session_ctx: Weak::new(),
            task_memory: Arc::new(AgentTaskMemory::new(dir.to_owned())),
            conversation: make_test_conversation().await,
            home_dir: dir.to_owned(),
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
                tools: None,
                color: None,
                model: None,
                sandbox_policy: None,
            })
            .unwrap();

        let tool = DelegateToAgentTool {
            agent_manager: manager,
            provider: make_dummy_provider(),
            config: AgentConfig::default(),
            // Dead weak references — tests do not reach run_react_loop.
            registry: Weak::new(),
            session_ctx: Weak::new(),
            task_memory: Arc::new(crate::agent_task_memory::AgentTaskMemory::new(dir.clone())),
            conversation: make_test_conversation().await,
            home_dir: dir.clone(),
        };

        // Set the context to the maximum depth already reached.
        let ctx = ToolExecutionContext {
            session_id: None,
            conversation_id: None,
            delegation_depth: MAX_DELEGATION_DEPTH,
            run_id: None,
            workspace_override: None,
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

    #[test]
    fn parse_tool_list_none_returns_empty() {
        let result = parse_tool_list(&None);
        assert!(result.is_empty(), "None tools should mean unrestricted");
    }

    #[test]
    fn parse_tool_list_parses_csv() {
        let result = parse_tool_list(&Some("read, write, exec".to_owned()));
        assert!(result.contains(&"read".to_owned()));
        assert!(result.contains(&"write".to_owned()));
        assert!(result.contains(&"exec".to_owned()));
    }

    #[test]
    fn parse_tool_list_includes_base_tools() {
        let result = parse_tool_list(&Some("read".to_owned()));
        for base in AGENT_BASE_TOOLS {
            assert!(
                result.contains(&base.to_string()),
                "base tool {base} should always be included"
            );
        }
    }

    #[test]
    fn parse_tool_list_no_duplicates_when_base_already_present() {
        let result = parse_tool_list(&Some("delegate, read".to_owned()));
        let delegate_count = result.iter().filter(|n| n.as_str() == "delegate").count();
        assert_eq!(delegate_count, 1, "delegate should not be duplicated");
    }
}
