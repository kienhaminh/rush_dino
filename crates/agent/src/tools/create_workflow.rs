use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{
    agent_manager::AgentManager,
    tool_registry::Tool,
    workflow_manager::WorkflowManager,
    workflow_types::{CreateWorkflowInput, WorkflowSource, WorkflowStatus, WorkflowStepInput},
};

pub struct CreateWorkflowTool {
    manager: Arc<WorkflowManager>,
    agent_manager: Arc<AgentManager>,
}

impl CreateWorkflowTool {
    pub fn new(manager: Arc<WorkflowManager>, agent_manager: Arc<AgentManager>) -> Self {
        Self {
            manager,
            agent_manager,
        }
    }
}

#[async_trait]
impl Tool for CreateWorkflowTool {
    fn name(&self) -> &str {
        "create_workflow"
    }

    fn description(&self) -> &str {
        "Create a persisted workflow definition with ordered agent-assigned steps"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "description": {"type": "string"},
                "status": {
                    "type": "string",
                    "enum": ["draft", "active"]
                },
                "steps": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "instructions": {"type": "string"},
                            "agent_id": {"type": "string"}
                        },
                        "required": ["name", "instructions", "agent_id"]
                    }
                }
            },
            "required": ["name", "steps"]
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
            .unwrap_or_default();

        let status = match args.get("status").and_then(Value::as_str) {
            Some("active") => WorkflowStatus::Active,
            Some("draft") | None => WorkflowStatus::Draft,
            Some(other) => {
                return Err(AppError::Validation(format!(
                    "invalid status value: {other}"
                )))
            }
        };

        let steps_raw = args
            .get("steps")
            .and_then(Value::as_array)
            .ok_or_else(|| AppError::Validation("steps array is required".to_owned()))?;

        let mut steps = Vec::with_capacity(steps_raw.len());
        for (index, raw) in steps_raw.iter().enumerate() {
            let name = raw
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::Validation(format!("steps[{index}].name is required")))?;
            let instructions = raw
                .get("instructions")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    AppError::Validation(format!("steps[{index}].instructions is required"))
                })?;
            let agent_id = raw
                .get("agent_id")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::Validation(format!("steps[{index}].agent_id is required")))?;

            if self.agent_manager.get(agent_id).is_none() {
                return Err(AppError::Validation(format!(
                    "steps[{index}] references unknown agent '{agent_id}'"
                )));
            }

            steps.push(WorkflowStepInput {
                name: name.to_owned(),
                instructions: instructions.to_owned(),
                agent_id: agent_id.to_owned(),
            });
        }

        let workflow = self
            .manager
            .create_workflow(
                CreateWorkflowInput {
                    name: name.to_owned(),
                    description: description.to_owned(),
                    status,
                    steps,
                },
                WorkflowSource::Agent,
                "agent-tool",
            )
            .await?;

        Ok(format!(
            "workflow '{}' created with id {} (status={}, source=agent)",
            workflow.name,
            workflow.id,
            workflow.status.as_str()
        ))
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, sync::Arc};

    use sqlx::SqlitePool;
    use uuid::Uuid;

    use crate::agent_manager::{AgentManager, AgentTemplate};

    use super::*;

    async fn setup_tool() -> CreateWorkflowTool {
        let pool = SqlitePool::connect(":memory:").await.expect("memory db");
        for statement in include_str!("../../../common/migrations/004_workflows.sql").split(';') {
            let sql = statement.trim();
            if sql.is_empty() {
                continue;
            }
            sqlx::query(sql).execute(&pool).await.expect("run statement");
        }

        let dir = std::env::temp_dir().join(format!("workflow-tool-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");

        let manager = Arc::new(AgentManager::new(dir.clone()));
        manager
            .save(&AgentTemplate {
                name: "general-assistant".to_owned(),
                description: "default".to_owned(),
                system_prompt: "You are helpful".to_owned(),
                icon: None,
            })
            .expect("save template");

        CreateWorkflowTool::new(Arc::new(WorkflowManager::new(Arc::new(pool))), manager)
    }

    #[tokio::test]
    async fn defaults_to_draft_status() {
        let tool = setup_tool().await;
        let result = tool
            .execute(json!({
                "name": "Test Workflow",
                "steps": [
                    {
                        "name": "Step 1",
                        "instructions": "Do thing",
                        "agent_id": "general-assistant"
                    }
                ]
            }))
            .await
            .expect("create workflow");

        assert!(result.contains("status=draft"));
    }

    #[tokio::test]
    async fn rejects_unknown_agent() {
        let tool = setup_tool().await;
        let err = tool
            .execute(json!({
                "name": "Test Workflow",
                "steps": [
                    {
                        "name": "Step 1",
                        "instructions": "Do thing",
                        "agent_id": "missing-agent"
                    }
                ]
            }))
            .await
            .expect_err("must reject unknown agent");

        assert!(err.to_string().contains("unknown agent"));
    }
}
