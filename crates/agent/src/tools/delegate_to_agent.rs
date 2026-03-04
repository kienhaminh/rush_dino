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
    engine::AgentConfig,
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
/// The tool looks up the target agent's system prompt from [`AgentManager`],
/// builds a fresh message list (system + user task), and runs a nested
/// [`run_react_loop`]. A [`Weak`] reference to [`ToolRegistry`] is held to
/// avoid a reference cycle: `ToolRegistry → DelegateToAgentTool → ToolRegistry`.
pub struct DelegateToAgentTool {
    agent_manager: Arc<AgentManager>,
    provider: Arc<Provider>,
    config: AgentConfig,
    /// Weak reference prevents a retain-cycle with the registry that owns this tool.
    registry: Weak<ToolRegistry>,
}

impl DelegateToAgentTool {
    pub fn new(
        agent_manager: Arc<AgentManager>,
        provider: Arc<Provider>,
        config: AgentConfig,
        registry: Weak<ToolRegistry>,
    ) -> Self {
        Self {
            agent_manager,
            provider,
            config,
            registry,
        }
    }
}

#[async_trait]
impl Tool for DelegateToAgentTool {
    fn name(&self) -> &str {
        "delegate_to_agent"
    }

    fn description(&self) -> &str {
        "Delegate the current task to a more suitable specialist agent. \
         Use this when you determine the task is outside your domain. \
         Available agents: brainstormer, code-simplifier, general-assistant, code-reviewer, \
         debugger, docs-manager, fullstack-developer, git-manager, journal-writer, \
         mcp-manager, project-manager, researcher, tester, ui-ux-designer, writer, \
         planner, data-analyst, devops-engineer, software-engineer, artist-designer, \
         content-creator, social-network-assistant, spawn-agent."
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
        // to propagate session/conversation IDs into the child context.
        let parent_ctx = current_tool_execution_context().unwrap_or(ToolExecutionContext {
            session_id: None,
            conversation_id: None,
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

        // Build the initial message list: target system prompt followed by the task.
        let messages = vec![
            Message {
                id: Uuid::new_v4().to_string(),
                role: Role::System,
                content: template.system_prompt,
                tool_calls: None,
                created_at: Utc::now(),
            },
            Message {
                id: Uuid::new_v4().to_string(),
                role: Role::User,
                content: task.to_owned(),
                tool_calls: None,
                created_at: Utc::now(),
            },
        ];

        // Build the child context with an incremented delegation depth so that
        // any tools called inside the nested loop respect the same depth limit.
        let child_ctx = ToolExecutionContext {
            delegation_depth: current_depth + 1,
            ..parent_ctx
        };

        let (response, _) = with_tool_execution_context(
            child_ctx,
            run_react_loop(self.provider.clone(), registry, messages, &self.config),
        )
        .await?;

        Ok(response.content)
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, sync::Weak};

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

    fn make_tool_with_manager(dir: &std::path::Path) -> DelegateToAgentTool {
        DelegateToAgentTool {
            agent_manager: Arc::new(AgentManager::new(dir.to_owned())),
            provider: make_dummy_provider(),
            config: AgentConfig::default(),
            // Dead weak reference — tests do not reach run_react_loop.
            registry: Weak::new(),
        }
    }

    #[tokio::test]
    async fn returns_error_for_unknown_agent() {
        let dir = std::env::temp_dir().join(format!("test-delegate-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let tool = make_tool_with_manager(&dir);

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
            })
            .unwrap();

        let tool = DelegateToAgentTool {
            agent_manager: manager,
            provider: make_dummy_provider(),
            config: AgentConfig::default(),
            registry: Weak::new(),
        };

        // Set the context to the maximum depth already reached.
        let ctx = ToolExecutionContext {
            session_id: None,
            conversation_id: None,
            delegation_depth: MAX_DELEGATION_DEPTH,
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
