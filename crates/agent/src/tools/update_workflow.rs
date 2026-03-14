use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{
    tool_registry::Tool,
    workflow_manager::WorkflowManager,
    workflow_types::{UpdateWorkflowInput, WorkflowStatus, WorkflowStepInput},
};

/// Allows the agent to update an existing workflow's name, description, status, or steps.
/// Agent IDs in steps are not validated here — the workflow manager handles DB constraints.
pub struct UpdateWorkflowTool {
    manager: Arc<WorkflowManager>,
}

impl UpdateWorkflowTool {
    pub fn new(manager: Arc<WorkflowManager>) -> Self {
        Self { manager }
    }
}

#[async_trait]
impl Tool for UpdateWorkflowTool {
    fn name(&self) -> &str {
        "workflow_update"
    }

    fn description(&self) -> &str {
        "Update an existing workflow's name, description, status, or steps"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "workflow_id": {"type": "string"},
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
            "required": ["workflow_id"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let workflow_id = args
            .get("workflow_id")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("workflow_id is required".to_owned()))?;

        let name = args
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_owned);

        let description = args
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_owned);

        let status = match args.get("status").and_then(Value::as_str) {
            Some("active") => Some(WorkflowStatus::Active),
            Some("draft") => Some(WorkflowStatus::Draft),
            None => None,
            Some(other) => {
                return Err(AppError::Validation(format!(
                    "invalid status value: {other}"
                )))
            }
        };

        // If steps are provided, validate each step has name/instructions/agent_id.
        let steps = if let Some(steps_raw) = args.get("steps").and_then(Value::as_array) {
            let mut parsed = Vec::with_capacity(steps_raw.len());
            for (index, raw) in steps_raw.iter().enumerate() {
                let step_name = raw
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        AppError::Validation(format!("steps[{index}].name is required"))
                    })?;
                let instructions = raw
                    .get("instructions")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        AppError::Validation(format!("steps[{index}].instructions is required"))
                    })?;
                let agent_id = raw
                    .get("agent_id")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        AppError::Validation(format!("steps[{index}].agent_id is required"))
                    })?;
                parsed.push(WorkflowStepInput {
                    name: step_name.to_owned(),
                    instructions: instructions.to_owned(),
                    agent_id: agent_id.to_owned(),
                    ..Default::default()
                });
            }
            Some(parsed)
        } else {
            None
        };

        let payload = UpdateWorkflowInput {
            name,
            description,
            status,
            steps,
        };

        let workflow = self.manager.update_workflow(workflow_id, payload).await?;

        Ok(format!(
            "workflow '{}' updated (status={}, steps={})",
            workflow.name,
            workflow.status.as_str(),
            workflow.steps.len()
        ))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::json;
    use sqlx::SqlitePool;

    use crate::{
        workflow_manager::WorkflowManager,
        workflow_types::{CreateWorkflowInput, WorkflowSource, WorkflowStatus, WorkflowStepInput},
    };

    use super::*;

    async fn setup() -> (Arc<WorkflowManager>, UpdateWorkflowTool) {
        let pool = SqlitePool::connect(":memory:").await.expect("memory db");
        // Run migrations so the workflow tables exist.
        for statement in include_str!("../../../common/migrations/001_init.sql").split(';') {
            let sql: &str = statement.trim();
            if sql.is_empty() {
                continue;
            }
            sqlx::query(sql).execute(&pool).await.expect("migration");
        }
        let manager = Arc::new(WorkflowManager::new(Arc::new(pool)));
        let tool = UpdateWorkflowTool::new(manager.clone());
        (manager, tool)
    }

    #[tokio::test]
    async fn updates_name_and_status() {
        let (manager, tool) = setup().await;

        // Create a workflow first.
        let workflow = manager
            .create_workflow(
                CreateWorkflowInput {
                    name: "Original Name".to_owned(),
                    description: String::new(),
                    status: WorkflowStatus::Draft,
                    steps: vec![WorkflowStepInput {
                        name: "Step 1".to_owned(),
                        instructions: "Do work".to_owned(),
                        agent_id: "general-assistant".to_owned(),
                        ..Default::default()
                    }],
                },
                WorkflowSource::Agent,
                "test",
            )
            .await
            .expect("create workflow");

        let result = tool
            .execute(json!({
                "workflow_id": workflow.id,
                "name": "Updated Name",
                "status": "active"
            }))
            .await
            .expect("update workflow");

        assert!(result.contains("Updated Name"));
        assert!(result.contains("status=active"));
    }

    #[tokio::test]
    async fn rejects_invalid_status() {
        let (manager, tool) = setup().await;

        let workflow = manager
            .create_workflow(
                CreateWorkflowInput {
                    name: "Wf".to_owned(),
                    description: String::new(),
                    status: WorkflowStatus::Draft,
                    steps: vec![WorkflowStepInput {
                        name: "S".to_owned(),
                        instructions: "Do it".to_owned(),
                        agent_id: "a".to_owned(),
                        ..Default::default()
                    }],
                },
                WorkflowSource::Agent,
                "test",
            )
            .await
            .expect("create workflow");

        let err = tool
            .execute(json!({
                "workflow_id": workflow.id,
                "status": "archived"
            }))
            .await
            .expect_err("bad status should be rejected");

        assert!(err.to_string().contains("invalid status"));
    }

    #[tokio::test]
    async fn rejects_missing_workflow_id() {
        let (_manager, tool) = setup().await;
        let err = tool
            .execute(json!({"name": "x"}))
            .await
            .expect_err("must require workflow_id");
        assert!(err.to_string().contains("workflow_id"));
    }
}
