use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{
    agent_manager::{AgentManager, AgentTemplate},
    tool_registry::Tool,
};

pub struct SpawnAgentTool {
    agent_manager: Arc<AgentManager>,
}

impl SpawnAgentTool {
    pub fn new(agent_manager: Arc<AgentManager>) -> Self {
        Self { agent_manager }
    }
}

#[async_trait]
impl Tool for SpawnAgentTool {
    fn name(&self) -> &str {
        "spawn_agents"
    }

    fn description(&self) -> &str {
        "Create a new custom agent template. The agent will be saved as a Markdown file \
         and immediately available for delegation. Use this when no existing agent \
         fits the user's specialized need."
    }

    fn keywords(&self) -> Vec<&str> {
        vec!["agent", "spawn", "subagent"]
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Unique kebab-case agent name (e.g. 'sql-optimizer')"
                },
                "description": {
                    "type": "string",
                    "description": "One-sentence description of this agent's domain"
                },
                "system_prompt": {
                    "type": "string",
                    "description": "Full system prompt for this agent"
                },
                "icon": {
                    "type": "string",
                    "description": "Optional emoji icon for the agent"
                }
            },
            "required": ["name", "description", "system_prompt"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let name = args
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("name is required".to_owned()))?;
        let description = args
            .get("description")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("description is required".to_owned()))?;
        let system_prompt = args
            .get("system_prompt")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("system_prompt is required".to_owned()))?;
        let icon = args.get("icon").and_then(Value::as_str).map(str::to_owned);

        let template = AgentTemplate {
            name: name.to_owned(),
            description: description.to_owned(),
            system_prompt: system_prompt.to_owned(),
            icon,
            model: None,
            tools: None,
            color: None,
            sandbox_policy: None,
        };

        let path = self.agent_manager.save(&template)?;
        Ok(format!("agent '{}' created at {}", name, path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[tokio::test]
    async fn creates_agent_md_file() {
        let dir = std::env::temp_dir().join(format!("test-spawn-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let mgr = Arc::new(AgentManager::new(dir.clone()));
        let tool = SpawnAgentTool::new(mgr.clone());

        let result = tool
            .execute(serde_json::json!({
                "name": "sql-optimizer",
                "description": "Optimizes SQL queries",
                "system_prompt": "You are a SQL expert.",
                "icon": "🗄️"
            }))
            .await
            .unwrap();

        assert!(result.contains("sql-optimizer"));
        let loaded = mgr.get("sql-optimizer").unwrap();
        assert_eq!(loaded.name, "sql-optimizer");
        assert_eq!(loaded.system_prompt, "You are a SQL expert.");
        assert_eq!(loaded.icon.as_deref(), Some("🗄️"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn returns_error_when_name_missing() {
        let dir = std::env::temp_dir().join(format!("test-spawn-err-{}", uuid::Uuid::new_v4()));
        let mgr = Arc::new(AgentManager::new(dir.clone()));
        let tool = SpawnAgentTool::new(mgr);

        let result = tool
            .execute(serde_json::json!({
                "description": "x",
                "system_prompt": "y"
            }))
            .await;

        assert!(result.is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
