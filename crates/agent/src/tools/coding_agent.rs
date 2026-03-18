use std::{path::PathBuf, sync::Arc};

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_acp::CodingAgentManager;
use rushdino_common::{AppError, Result};

use crate::tool_registry::Tool;

/// Tool that delegates a coding task to a spawned ACP coding-agent process.
/// One `CodingAgentTool` is registered per known agent (claude, codex, gemini).
pub struct CodingAgentTool {
    agent_id: String,
    manager: Arc<CodingAgentManager>,
    workspace_root: PathBuf,
}

impl CodingAgentTool {
    pub fn new(
        agent_id: impl Into<String>,
        manager: Arc<CodingAgentManager>,
        workspace_root: PathBuf,
    ) -> Self {
        Self {
            agent_id: agent_id.into(),
            manager,
            workspace_root,
        }
    }
}

#[async_trait]
impl Tool for CodingAgentTool {
    fn name(&self) -> &str {
        &self.agent_id
    }

    fn description(&self) -> &str {
        "Delegate a coding task to an external coding agent (claude/codex/gemini) via ACP stdio"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "The coding task or prompt to send to the agent"
                },
                "conversation_id": {
                    "type": "string",
                    "description": "Rush Dino conversation id to associate the ACP session with"
                },
                "working_dir": {
                    "type": "string",
                    "description": "Optional absolute path for the agent's working directory"
                }
            },
            "required": ["task", "conversation_id"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let task = args
            .get("task")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("task is required".to_owned()))?;

        let conversation_id = args
            .get("conversation_id")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("conversation_id is required".to_owned()))?;

        let working_dir = args
            .get("working_dir")
            .and_then(Value::as_str)
            .map(PathBuf::from);

        let working_dir = working_dir.or_else(|| Some(self.workspace_root.clone()));

        let session = self
            .manager
            .spawn_session(&self.agent_id, conversation_id, working_dir)
            .await?;

        let result = self
            .manager
            .send_prompt(&session.id, task, true)
            .await?;

        Ok(result)
    }
}
