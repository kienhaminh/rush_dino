//! Agents list tool — list agent ids available for delegation/spawn.
//! Ported from OpenClaw's agents_list tool.

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::Result;

use crate::agent_manager::AgentManager;
use crate::tool_registry::Tool;

pub struct AgentsListTool {
    agent_manager: Arc<AgentManager>,
}

impl AgentsListTool {
    pub fn new(agent_manager: Arc<AgentManager>) -> Self {
        Self { agent_manager }
    }
}

#[async_trait]
impl Tool for AgentsListTool {
    fn name(&self) -> &str {
        "agents_list"
    }

    fn description(&self) -> &str {
        "List agent ids you can target with delegate_to_agent or spawn_sub_agent."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {}
        })
    }

    async fn execute(&self, _args: Value) -> Result<String> {
        let templates = self.agent_manager.list();
        let agents: Vec<Value> = templates
            .into_iter()
            .map(|t| {
                json!({
                    "id": t.name,
                    "name": t.description,
                    "configured": true
                })
            })
            .collect();

        let result = json!({
            "agents": agents,
            "count": agents.len()
        });

        serde_json::to_string_pretty(&result)
            .map_err(|e| rushdino_common::AppError::Agent(e.to_string()))
    }
}
