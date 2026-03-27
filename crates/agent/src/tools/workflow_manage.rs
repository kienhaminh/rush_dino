use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{
    agent_manager::AgentManager,
    tool_registry::Tool,
    workflow_manager::WorkflowManager,
    workflow_types::{CreateWorkflowInput, UpdateWorkflowInput, WorkflowSource, WorkflowStatus, WorkflowStepInput},
};

/// Unified CRUD tool for workflow management — create, update, delete, or inspect.
/// Keeps `workflow_run` as a separate tool since running is a distinct concern.
pub struct WorkflowManageTool {
    manager: Arc<WorkflowManager>,
    agent_manager: Arc<AgentManager>,
}

impl WorkflowManageTool {
    pub fn new(manager: Arc<WorkflowManager>, agent_manager: Arc<AgentManager>) -> Self {
        Self {
            manager,
            agent_manager,
        }
    }
}

#[async_trait]
impl Tool for WorkflowManageTool {
    fn name(&self) -> &str {
        "workflow_manage"
    }

    fn description(&self) -> &str {
        "Manage workflows — create, update, delete, or inspect"
    }

    fn keywords(&self) -> Vec<&str> {
        vec!["workflow", "pipeline", "automation"]
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["create", "update", "delete", "inspect"],
                    "description": "The operation to perform"
                },
                "workflow_id": {
                    "type": "string",
                    "description": "Required for update, delete, inspect (single). Optional for inspect (list all)."
                },
                "name": {
                    "type": "string",
                    "description": "Workflow name. Required for create, optional for update."
                },
                "description": {
                    "type": "string",
                    "description": "Workflow description. Optional for create and update."
                },
                "status": {
                    "type": "string",
                    "enum": ["draft", "active"],
                    "description": "Workflow status. Defaults to draft for create. Optional for update."
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
                    },
                    "description": "Workflow steps. Required for create, optional for update."
                }
            },
            "required": ["action"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let action = args
            .get("action")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("action is required".to_owned()))?;

        match action {
            "create" => self.execute_create(&args).await,
            "update" => self.execute_update(&args).await,
            "delete" => self.execute_delete(&args).await,
            "inspect" => self.execute_inspect(&args).await,
            other => Err(AppError::Validation(format!(
                "invalid action: {other}. Must be one of: create, update, delete, inspect"
            ))),
        }
    }
}

impl WorkflowManageTool {
    async fn execute_create(&self, args: &Value) -> Result<String> {
        let name = args
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("name is required for create".to_owned()))?;

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
            .ok_or_else(|| AppError::Validation("steps array is required for create".to_owned()))?;

        let mut steps = Vec::with_capacity(steps_raw.len());
        for (index, raw) in steps_raw.iter().enumerate() {
            let step_name = raw
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::Validation(format!("steps[{index}].name is required")))?;
            let instructions =
                raw.get("instructions")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        AppError::Validation(format!("steps[{index}].instructions is required"))
                    })?;
            let agent_id = raw.get("agent_id").and_then(Value::as_str).ok_or_else(|| {
                AppError::Validation(format!("steps[{index}].agent_id is required"))
            })?;

            if self.agent_manager.get(agent_id).is_none() {
                return Err(AppError::Validation(format!(
                    "steps[{index}] references unknown agent '{agent_id}'"
                )));
            }

            steps.push(WorkflowStepInput {
                name: step_name.to_owned(),
                instructions: instructions.to_owned(),
                agent_id: agent_id.to_owned(),
                ..Default::default()
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

    async fn execute_update(&self, args: &Value) -> Result<String> {
        let workflow_id = args
            .get("workflow_id")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("workflow_id is required for update".to_owned()))?;

        let name = args.get("name").and_then(Value::as_str).map(str::to_owned);

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

        let steps = if let Some(steps_raw) = args.get("steps").and_then(Value::as_array) {
            let mut parsed = Vec::with_capacity(steps_raw.len());
            for (index, raw) in steps_raw.iter().enumerate() {
                let step_name = raw.get("name").and_then(Value::as_str).ok_or_else(|| {
                    AppError::Validation(format!("steps[{index}].name is required"))
                })?;
                let instructions =
                    raw.get("instructions")
                        .and_then(Value::as_str)
                        .ok_or_else(|| {
                            AppError::Validation(format!("steps[{index}].instructions is required"))
                        })?;
                let agent_id = raw.get("agent_id").and_then(Value::as_str).ok_or_else(|| {
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

    async fn execute_delete(&self, args: &Value) -> Result<String> {
        let workflow_id = args
            .get("workflow_id")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("workflow_id is required for delete".to_owned()))?;

        self.manager.delete_workflow(workflow_id).await?;

        Ok(format!("workflow {workflow_id} deleted"))
    }

    async fn execute_inspect(&self, args: &Value) -> Result<String> {
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
    use std::{fs, sync::Arc};

    use serde_json::json;
    use sqlx::SqlitePool;
    use uuid::Uuid;

    use crate::{
        agent_manager::{AgentManager, AgentTemplate},
        workflow_manager::WorkflowManager,
        workflow_types::{CreateWorkflowInput, WorkflowSource, WorkflowStatus, WorkflowStepInput},
    };

    use super::*;

    /// Shared setup: in-memory SQLite + agent manager with one known agent.
    async fn setup() -> (Arc<WorkflowManager>, WorkflowManageTool) {
        let pool = SqlitePool::connect(":memory:").await.expect("memory db");
        for statement in include_str!("../../../common/migrations/001_init.sql").split(';') {
            let sql: &str = statement.trim();
            if sql.is_empty() {
                continue;
            }
            sqlx::query(sql)
                .execute(&pool)
                .await
                .expect("run statement");
        }

        let dir = std::env::temp_dir().join(format!("workflow-manage-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");

        let agent_manager = Arc::new(AgentManager::new(dir));
        agent_manager
            .save(&AgentTemplate {
                name: "software-engineer".to_owned(),
                description: "default".to_owned(),
                system_prompt: "You are helpful".to_owned(),
                icon: None,
                tools: None,
                color: None,
                model: None,
                claims_tasks: true,
                sandbox_policy: None,
            })
            .expect("save template");

        let manager = Arc::new(WorkflowManager::new(Arc::new(pool)));
        let tool = WorkflowManageTool::new(manager.clone(), agent_manager);
        (manager, tool)
    }

    /// Helper to create a workflow directly via the manager (bypassing the tool).
    async fn seed_workflow(manager: &WorkflowManager) -> String {
        let workflow = manager
            .create_workflow(
                CreateWorkflowInput {
                    name: "Seeded Workflow".to_owned(),
                    description: String::new(),
                    status: WorkflowStatus::Draft,
                    steps: vec![WorkflowStepInput {
                        name: "Step 1".to_owned(),
                        instructions: "Do work".to_owned(),
                        agent_id: "software-engineer".to_owned(),
                        ..Default::default()
                    }],
                },
                WorkflowSource::Agent,
                "test",
            )
            .await
            .expect("seed workflow");
        workflow.id
    }

    // ── create ──────────────────────────────────────────────────────

    #[tokio::test]
    async fn create_defaults_to_draft_status() {
        let (_manager, tool) = setup().await;
        let result = tool
            .execute(json!({
                "action": "create",
                "name": "Test Workflow",
                "steps": [
                    {
                        "name": "Step 1",
                        "instructions": "Do thing",
                        "agent_id": "software-engineer"
                    }
                ]
            }))
            .await
            .expect("create workflow");

        assert!(result.contains("status=draft"));
    }

    #[tokio::test]
    async fn create_rejects_unknown_agent() {
        let (_manager, tool) = setup().await;
        let err = tool
            .execute(json!({
                "action": "create",
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

    // ── update ──────────────────────────────────────────────────────

    #[tokio::test]
    async fn update_name_and_status() {
        let (manager, tool) = setup().await;
        let id = seed_workflow(&manager).await;

        let result = tool
            .execute(json!({
                "action": "update",
                "workflow_id": id,
                "name": "Updated Name",
                "status": "active"
            }))
            .await
            .expect("update workflow");

        assert!(result.contains("Updated Name"));
        assert!(result.contains("status=active"));
    }

    #[tokio::test]
    async fn update_rejects_invalid_status() {
        let (manager, tool) = setup().await;
        let id = seed_workflow(&manager).await;

        let err = tool
            .execute(json!({
                "action": "update",
                "workflow_id": id,
                "status": "archived"
            }))
            .await
            .expect_err("bad status should be rejected");

        assert!(err.to_string().contains("invalid status"));
    }

    #[tokio::test]
    async fn update_rejects_missing_workflow_id() {
        let (_manager, tool) = setup().await;
        let err = tool
            .execute(json!({"action": "update", "name": "x"}))
            .await
            .expect_err("must require workflow_id");
        assert!(err.to_string().contains("workflow_id"));
    }

    // ── delete ──────────────────────────────────────────────────────

    #[tokio::test]
    async fn delete_existing_workflow() {
        let (manager, tool) = setup().await;
        let id = seed_workflow(&manager).await;

        let result = tool
            .execute(json!({"action": "delete", "workflow_id": id}))
            .await
            .expect("delete should succeed");

        assert!(result.contains("deleted"));

        let err = manager
            .get_workflow(&id)
            .await
            .expect_err("workflow should be gone");
        assert!(err.to_string().contains("not found"));
    }

    #[tokio::test]
    async fn delete_returns_not_found_for_missing_workflow() {
        let (_manager, tool) = setup().await;
        let err = tool
            .execute(json!({"action": "delete", "workflow_id": "nonexistent-id"}))
            .await
            .expect_err("should fail for unknown id");
        assert!(err.to_string().contains("not found"));
    }

    #[tokio::test]
    async fn delete_rejects_missing_workflow_id() {
        let (_manager, tool) = setup().await;
        let err = tool
            .execute(json!({"action": "delete"}))
            .await
            .expect_err("must require workflow_id");
        assert!(err.to_string().contains("workflow_id"));
    }

    // ── inspect ─────────────────────────────────────────────────────

    #[tokio::test]
    async fn inspect_lists_all_workflows_when_no_id_given() {
        let (manager, tool) = setup().await;
        let _ = seed_workflow(&manager).await;

        let result = tool
            .execute(json!({"action": "inspect"}))
            .await
            .expect("inspect all");

        assert!(result.contains("Seeded Workflow"));
        assert!(result.contains("status=draft"));
        assert!(result.contains("steps=1"));
    }

    #[tokio::test]
    async fn inspect_shows_detail_for_specific_workflow() {
        let (manager, tool) = setup().await;
        let id = seed_workflow(&manager).await;

        let result = tool
            .execute(json!({"action": "inspect", "workflow_id": id}))
            .await
            .expect("inspect detail");

        assert!(result.contains("Seeded Workflow"));
        assert!(result.contains("Step 1"));
        assert!(result.contains("recent runs:"));
        assert!(result.contains("(none)"));
    }

    #[tokio::test]
    async fn inspect_returns_no_workflows_when_empty() {
        let (_manager, tool) = setup().await;
        let result = tool
            .execute(json!({"action": "inspect"}))
            .await
            .expect("empty list");
        assert!(result.contains("no workflows found"));
    }

    // ── action validation ───────────────────────────────────────────

    #[tokio::test]
    async fn rejects_invalid_action() {
        let (_manager, tool) = setup().await;
        let err = tool
            .execute(json!({"action": "purge"}))
            .await
            .expect_err("invalid action");
        assert!(err.to_string().contains("invalid action"));
    }

    #[tokio::test]
    async fn rejects_missing_action() {
        let (_manager, tool) = setup().await;
        let err = tool
            .execute(json!({}))
            .await
            .expect_err("missing action");
        assert!(err.to_string().contains("action is required"));
    }
}
