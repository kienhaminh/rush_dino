use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{orchestrator::Orchestrator, tool_registry::Tool};

pub struct SpawnSubAgentTool {
    orchestrator: Arc<Orchestrator>,
}

impl SpawnSubAgentTool {
    pub fn new(orchestrator: Arc<Orchestrator>) -> Self {
        Self { orchestrator }
    }
}

#[async_trait]
impl Tool for SpawnSubAgentTool {
    fn name(&self) -> &str {
        "subagents"
    }

    fn description(&self) -> &str {
        "Spawn one-level sub-agent task"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {"instructions": {"type": "string"}},
            "required": ["instructions"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let instructions = args
            .get("instructions")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("instructions is required".to_owned()))?;
        let id = self
            .orchestrator
            .spawn_sub_agent(instructions.to_owned())
            .await?;
        Ok(format!("sub-agent task started: {id}"))
    }
}
