use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::sync::OnceCell;

use rushdino_common::{AppError, Result};

use crate::{
    tool_registry::Tool,
    workflow_manager::WorkflowManager,
    workflow_runner::WorkflowRunner,
};

/// Starts a new run of an existing (active) workflow.
///
/// `runner_cell` is populated after the engine finishes constructing all its components.
/// If the cell is not yet filled (engine not fully started), the tool returns an error
/// rather than panicking.
pub struct RunWorkflowTool {
    manager: Arc<WorkflowManager>,
    runner_cell: Arc<OnceCell<Arc<WorkflowRunner>>>,
}

impl RunWorkflowTool {
    pub fn new(
        manager: Arc<WorkflowManager>,
        runner_cell: Arc<OnceCell<Arc<WorkflowRunner>>>,
    ) -> Self {
        Self {
            manager,
            runner_cell,
        }
    }
}

#[async_trait]
impl Tool for RunWorkflowTool {
    fn name(&self) -> &str {
        "workflow_run"
    }

    fn description(&self) -> &str {
        "Start a new run of a workflow"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "workflow_id": {"type": "string"},
                "input": {"type": "string"}
            },
            "required": ["workflow_id"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let workflow_id = args
            .get("workflow_id")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("workflow_id is required".to_owned()))?;

        let input = args
            .get("input")
            .and_then(Value::as_str)
            .unwrap_or_default();

        // Create the run record in the database.
        let run = self
            .manager
            .create_run(workflow_id, "agent-tool", input)
            .await?;

        // Obtain the runner — it must be available by the time tools are executed.
        let runner = self
            .runner_cell
            .get()
            .ok_or_else(|| AppError::Validation("runner not ready".to_owned()))?;

        // Fire-and-forget: the runner executes steps asynchronously in a tokio task.
        runner.spawn_run(run.run_id.clone());

        Ok(format!(
            "workflow run {} started (status={})",
            run.run_id,
            run.status.as_str()
        ))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::json;
    use sqlx::SqlitePool;
    use tokio::sync::OnceCell;

    use crate::{
        workflow_manager::WorkflowManager,
        workflow_types::{CreateWorkflowInput, WorkflowSource, WorkflowStatus, WorkflowStepInput},
    };

    use super::*;

    async fn setup_manager() -> Arc<WorkflowManager> {
        let pool = SqlitePool::connect(":memory:").await.expect("memory db");
        for statement in include_str!("../../../common/migrations/004_workflows.sql").split(';') {
            let sql = statement.trim();
            if sql.is_empty() {
                continue;
            }
            sqlx::query(sql).execute(&pool).await.expect("migration");
        }
        Arc::new(WorkflowManager::new(Arc::new(pool)))
    }

    #[tokio::test]
    async fn returns_error_when_runner_not_ready() {
        let manager = setup_manager().await;

        // Create an active workflow so create_run can succeed.
        let workflow = manager
            .create_workflow(
                CreateWorkflowInput {
                    name: "Active Wf".to_owned(),
                    description: String::new(),
                    status: WorkflowStatus::Active,
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

        // Build a tool with an empty (never-set) OnceCell to simulate runner not ready.
        let empty_cell: Arc<OnceCell<Arc<WorkflowRunner>>> = Arc::new(OnceCell::new());
        let tool = RunWorkflowTool::new(manager, empty_cell);

        let err = tool
            .execute(json!({"workflow_id": workflow.id}))
            .await
            .expect_err("should fail when runner is not ready");

        assert!(err.to_string().contains("runner not ready"));
    }

    #[tokio::test]
    async fn rejects_draft_workflow() {
        let manager = setup_manager().await;

        let workflow = manager
            .create_workflow(
                CreateWorkflowInput {
                    name: "Draft Wf".to_owned(),
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

        let empty_cell: Arc<OnceCell<Arc<WorkflowRunner>>> = Arc::new(OnceCell::new());
        let tool = RunWorkflowTool::new(manager, empty_cell);

        let err = tool
            .execute(json!({"workflow_id": workflow.id}))
            .await
            .expect_err("draft workflow should not be runnable");

        assert!(err.to_string().contains("draft"));
    }

    #[tokio::test]
    async fn rejects_missing_workflow_id() {
        let manager = setup_manager().await;
        let empty_cell: Arc<OnceCell<Arc<WorkflowRunner>>> = Arc::new(OnceCell::new());
        let tool = RunWorkflowTool::new(manager, empty_cell);

        let err = tool
            .execute(json!({}))
            .await
            .expect_err("must require workflow_id");
        assert!(err.to_string().contains("workflow_id"));
    }
}
