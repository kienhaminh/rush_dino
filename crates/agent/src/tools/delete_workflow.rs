use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{tool_registry::Tool, workflow_manager::WorkflowManager};

/// Allows the agent to permanently delete a workflow and all its associated runs.
pub struct DeleteWorkflowTool {
    manager: Arc<WorkflowManager>,
}

impl DeleteWorkflowTool {
    pub fn new(manager: Arc<WorkflowManager>) -> Self {
        Self { manager }
    }
}

#[async_trait]
impl Tool for DeleteWorkflowTool {
    fn name(&self) -> &str {
        "workflow_delete"
    }

    fn description(&self) -> &str {
        "Delete a workflow and all its runs"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "workflow_id": {"type": "string"}
            },
            "required": ["workflow_id"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let workflow_id = args
            .get("workflow_id")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("workflow_id is required".to_owned()))?;

        self.manager.delete_workflow(workflow_id).await?;

        Ok(format!("workflow {workflow_id} deleted"))
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

    async fn setup() -> (Arc<WorkflowManager>, DeleteWorkflowTool) {
        let pool = SqlitePool::connect(":memory:").await.expect("memory db");
        for statement in include_str!("../../../common/migrations/001_init.sql").split(';') {
            let sql: &str = statement.trim();
            if sql.is_empty() {
                continue;
            }
            sqlx::query(sql).execute(&pool).await.expect("migration");
        }
        let manager = Arc::new(WorkflowManager::new(Arc::new(pool)));
        let tool = DeleteWorkflowTool::new(manager.clone());
        (manager, tool)
    }

    #[tokio::test]
    async fn deletes_existing_workflow() {
        let (manager, tool) = setup().await;

        let workflow = manager
            .create_workflow(
                CreateWorkflowInput {
                    name: "To Delete".to_owned(),
                    description: String::new(),
                    status: WorkflowStatus::Draft,
                    steps: vec![WorkflowStepInput {
                        name: "Step".to_owned(),
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
            .execute(json!({"workflow_id": workflow.id}))
            .await
            .expect("delete should succeed");

        assert!(result.contains("deleted"));

        // Confirm it is gone from the manager.
        let err = manager
            .get_workflow(&workflow.id)
            .await
            .expect_err("workflow should be gone");
        assert!(err.to_string().contains("not found"));
    }

    #[tokio::test]
    async fn returns_not_found_for_missing_workflow() {
        let (_manager, tool) = setup().await;
        let err = tool
            .execute(json!({"workflow_id": "nonexistent-id"}))
            .await
            .expect_err("should fail for unknown id");
        assert!(err.to_string().contains("not found"));
    }

    #[tokio::test]
    async fn rejects_missing_workflow_id() {
        let (_manager, tool) = setup().await;
        let err = tool
            .execute(json!({}))
            .await
            .expect_err("must require workflow_id");
        assert!(err.to_string().contains("workflow_id"));
    }
}
