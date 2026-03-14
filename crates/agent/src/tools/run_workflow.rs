use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{
    tool_registry::Tool,
    workflow_manager::WorkflowManager,
    workflow_runner::WorkflowRunner,
};

/// Starts a new run of an existing (active) workflow.
pub struct RunWorkflowTool {
    manager: Arc<WorkflowManager>,
    runner: Arc<WorkflowRunner>,
}

impl RunWorkflowTool {
    pub fn new(manager: Arc<WorkflowManager>, runner: Arc<WorkflowRunner>) -> Self {
        Self { manager, runner }
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

        // Fire-and-forget: the runner executes steps asynchronously in a tokio task.
        self.runner.spawn_run(run.run_id.clone());

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

    use rushdino_providers::{CompletionsProvider, Provider};

    use crate::{
        agent_manager::AgentManager,
        conversation::ConversationManager,
        engine::AgentConfig,
        memory::MemoryManager,
        runtime::AgentRuntime,
        tool_registry::ToolRegistry,
        workflow_manager::WorkflowManager,
        workflow_types::{CreateWorkflowInput, WorkflowSource, WorkflowStatus, WorkflowStepInput},
    };

    use super::*;

    async fn setup_pool() -> Arc<SqlitePool> {
        let pool = SqlitePool::connect(":memory:").await.expect("memory db");
        for statement in include_str!("../../../common/migrations/004_workflows.sql").split(';') {
            let sql = statement.trim();
            if sql.is_empty() {
                continue;
            }
            sqlx::query(sql).execute(&pool).await.expect("migration");
        }
        Arc::new(pool)
    }

    fn build_runner(pool: Arc<SqlitePool>) -> Arc<WorkflowRunner> {
        let provider = Arc::new(Provider::Ollama(CompletionsProvider::new(
            "http://localhost:11434".to_owned(),
            "test-model".to_owned(),
            None,
            None,
        )));
        let tool_registry = Arc::new(ToolRegistry::new());
        let conversation = Arc::new(ConversationManager::new(pool.clone()));
        let memory = Arc::new(MemoryManager::new(std::env::temp_dir()));
        let agent_manager = Arc::new(AgentManager::new(std::env::temp_dir()));
        let workflow_manager = Arc::new(WorkflowManager::new(pool.clone()));
        let runtime = Arc::new(AgentRuntime::new(pool));
        Arc::new(WorkflowRunner::new(
            provider,
            tool_registry,
            conversation,
            memory,
            agent_manager,
            workflow_manager,
            runtime,
            AgentConfig::default(),
        ))
    }

    #[tokio::test]
    async fn rejects_draft_workflow() {
        let pool = setup_pool().await;
        let manager = Arc::new(WorkflowManager::new(pool.clone()));

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

        let tool = RunWorkflowTool::new(manager, build_runner(pool));

        let err = tool
            .execute(json!({"workflow_id": workflow.id}))
            .await
            .expect_err("draft workflow should not be runnable");

        assert!(err.to_string().contains("draft"));
    }

    #[tokio::test]
    async fn rejects_missing_workflow_id() {
        let pool = setup_pool().await;
        let manager = Arc::new(WorkflowManager::new(pool.clone()));
        let tool = RunWorkflowTool::new(manager, build_runner(pool));

        let err = tool
            .execute(json!({}))
            .await
            .expect_err("must require workflow_id");
        assert!(err.to_string().contains("workflow_id"));
    }
}
