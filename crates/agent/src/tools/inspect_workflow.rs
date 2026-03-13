use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::Result;

use crate::{tool_registry::Tool, workflow_manager::WorkflowManager};

/// Lists all workflows or shows a detailed view of a single workflow including its recent runs.
pub struct InspectWorkflowTool {
    manager: Arc<WorkflowManager>,
}

impl InspectWorkflowTool {
    pub fn new(manager: Arc<WorkflowManager>) -> Self {
        Self { manager }
    }
}

#[async_trait]
impl Tool for InspectWorkflowTool {
    fn name(&self) -> &str {
        "workflow_inspect"
    }

    fn description(&self) -> &str {
        "Inspect workflows — list all or get detail with recent runs for a specific workflow"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "workflow_id": {"type": "string"}
            },
            "required": []
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        if let Some(id) = args.get("workflow_id").and_then(Value::as_str) {
            // Detailed view: fetch workflow + recent runs.
            let workflow = self.manager.get_workflow(id).await?;
            let runs = self.manager.list_runs(id, 5).await?;

            let step_names: Vec<&str> = workflow.steps.iter().map(|s| s.name.as_str()).collect();
            let steps_str = if step_names.is_empty() {
                "(no steps)".to_owned()
            } else {
                step_names.join(", ")
            };

            let mut lines = vec![
                format!(
                    "workflow: {} ({})\nstatus: {}\nsteps: {}",
                    workflow.name,
                    workflow.id,
                    workflow.status.as_str(),
                    steps_str
                ),
                String::new(),
                "recent runs:".to_owned(),
            ];

            if runs.is_empty() {
                lines.push("  (none)".to_owned());
            } else {
                for run in &runs {
                    let started = run.started_at.as_str();
                    lines.push(format!(
                        "  {} | {} | triggered_by={} | started={}",
                        run.id,
                        run.status.as_str(),
                        run.triggered_by,
                        started,
                    ));
                }
            }

            Ok(lines.join("\n"))
        } else {
            // List view: compact summary of all workflows.
            let workflows = self.manager.list_workflows().await?;

            if workflows.is_empty() {
                return Ok("no workflows found".to_owned());
            }

            let lines: Vec<String> = workflows
                .iter()
                .map(|w| {
                    format!(
                        "{} | {} | status={} | steps={}",
                        w.id,
                        w.name,
                        w.status.as_str(),
                        w.step_count
                    )
                })
                .collect();

            Ok(lines.join("\n"))
        }
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

    async fn setup() -> (Arc<WorkflowManager>, InspectWorkflowTool) {
        let pool = SqlitePool::connect(":memory:").await.expect("memory db");
        for statement in include_str!("../../../common/migrations/004_workflows.sql").split(';') {
            let sql = statement.trim();
            if sql.is_empty() {
                continue;
            }
            sqlx::query(sql).execute(&pool).await.expect("migration");
        }
        let manager = Arc::new(WorkflowManager::new(Arc::new(pool)));
        let tool = InspectWorkflowTool::new(manager.clone());
        (manager, tool)
    }

    #[tokio::test]
    async fn lists_all_workflows_when_no_id_given() {
        let (manager, tool) = setup().await;

        manager
            .create_workflow(
                CreateWorkflowInput {
                    name: "Workflow A".to_owned(),
                    description: String::new(),
                    status: WorkflowStatus::Draft,
                    steps: vec![WorkflowStepInput {
                        name: "Step 1".to_owned(),
                        instructions: "Do it".to_owned(),
                        agent_id: "agent-a".to_owned(),
                        ..Default::default()
                    }],
                },
                WorkflowSource::Agent,
                "test",
            )
            .await
            .expect("create workflow");

        let result = tool.execute(json!({})).await.expect("inspect all");

        assert!(result.contains("Workflow A"));
        assert!(result.contains("status=draft"));
        assert!(result.contains("steps=1"));
    }

    #[tokio::test]
    async fn shows_detail_for_specific_workflow() {
        let (manager, tool) = setup().await;

        let workflow = manager
            .create_workflow(
                CreateWorkflowInput {
                    name: "Detail Workflow".to_owned(),
                    description: String::new(),
                    status: WorkflowStatus::Draft,
                    steps: vec![WorkflowStepInput {
                        name: "Analyze".to_owned(),
                        instructions: "Analyze input".to_owned(),
                        agent_id: "analyst".to_owned(),
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
            .expect("inspect detail");

        assert!(result.contains("Detail Workflow"));
        assert!(result.contains("Analyze"));
        assert!(result.contains("recent runs:"));
        assert!(result.contains("(none)"));
    }

    #[tokio::test]
    async fn returns_no_workflows_when_empty() {
        let (_manager, tool) = setup().await;
        let result = tool.execute(json!({})).await.expect("empty list");
        assert!(result.contains("no workflows found"));
    }
}
