use std::sync::Arc;

use sqlx::SqlitePool;

use crate::workflow_types::{
    CreateWorkflowInput, WorkflowRunStatus, WorkflowSource, WorkflowStatus, WorkflowStepInput,
};

use super::WorkflowManager;

async fn create_manager() -> WorkflowManager {
    let pool = SqlitePool::connect(":memory:")
        .await
        .expect("memory sqlite");
    let migrations: &[&str] = &[
        include_str!("../../../common/migrations/001_init.sql"),
        include_str!("../../../common/migrations/010_workflow_step_type.sql"),
    ];
    for migration in migrations {
        for statement in migration.split(';') {
            let sql: &str = statement.trim();
            if sql.is_empty() {
                continue;
            }
            sqlx::query(sql)
                .execute(&pool)
                .await
                .expect("run migration statement");
        }
    }
    WorkflowManager::new(Arc::new(pool))
}

#[tokio::test]
async fn creates_and_lists_workflow() {
    let manager = create_manager().await;
    let workflow = manager
        .create_workflow(
            CreateWorkflowInput {
                name: "Daily Triage".to_owned(),
                description: "Triage incoming tasks".to_owned(),
                status: WorkflowStatus::Active,
                steps: vec![WorkflowStepInput {
                    name: "Classify".to_owned(),
                    instructions: "Classify input".to_owned(),
                    agent_id: "software-engineer".to_owned(),
                    ..Default::default()
                }],
            },
            WorkflowSource::Manual,
            "user",
        )
        .await
        .expect("create workflow");

    assert_eq!(workflow.name, "Daily Triage");
    assert_eq!(workflow.steps.len(), 1);

    let items = manager.list_workflows().await.expect("list workflows");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].step_count, 1);
}

#[tokio::test]
async fn rejects_run_when_workflow_is_draft() {
    let manager = create_manager().await;
    let workflow = manager
        .create_workflow(
            CreateWorkflowInput {
                name: "Draft Pipeline".to_owned(),
                description: "Draft".to_owned(),
                status: WorkflowStatus::Draft,
                steps: vec![WorkflowStepInput {
                    name: "Step".to_owned(),
                    instructions: "Do work".to_owned(),
                    agent_id: "software-engineer".to_owned(),
                    ..Default::default()
                }],
            },
            WorkflowSource::Manual,
            "user",
        )
        .await
        .expect("create draft workflow");

    let err = manager
        .create_run(&workflow.id, "user", "")
        .await
        .expect_err("run must fail for draft");
    assert!(err.to_string().contains("draft"));
}

#[tokio::test]
async fn rejects_concurrent_active_runs_for_same_workflow() {
    let manager = create_manager().await;
    let workflow = manager
        .create_workflow(
            CreateWorkflowInput {
                name: "Concurrent".to_owned(),
                description: String::new(),
                status: WorkflowStatus::Active,
                steps: vec![WorkflowStepInput {
                    name: "Step 1".to_owned(),
                    instructions: "Do task".to_owned(),
                    agent_id: "software-engineer".to_owned(),
                    ..Default::default()
                }],
            },
            WorkflowSource::Manual,
            "user",
        )
        .await
        .expect("create workflow");

    let first = manager
        .create_run(&workflow.id, "user", "input")
        .await
        .expect("start first run");
    assert_eq!(first.status, WorkflowRunStatus::Queued);

    let err = manager
        .create_run(&workflow.id, "user", "input")
        .await
        .expect_err("second concurrent run should fail");
    assert!(err.to_string().contains("active run"));
}

#[tokio::test]
async fn delete_workflow_cascades_steps_and_runs() {
    let manager = create_manager().await;
    let workflow = manager
        .create_workflow(
            CreateWorkflowInput {
                name: "Delete Cascade".to_owned(),
                description: String::new(),
                status: WorkflowStatus::Active,
                steps: vec![WorkflowStepInput {
                    name: "Step 1".to_owned(),
                    instructions: "Do task".to_owned(),
                    agent_id: "software-engineer".to_owned(),
                    ..Default::default()
                }],
            },
            WorkflowSource::Manual,
            "user",
        )
        .await
        .expect("create workflow");

    let run = manager
        .create_run(&workflow.id, "user", "")
        .await
        .expect("create run");

    manager
        .delete_workflow(&workflow.id)
        .await
        .expect("delete workflow");

    let missing_workflow = manager
        .get_workflow(&workflow.id)
        .await
        .expect_err("workflow should be deleted");
    assert!(missing_workflow.to_string().contains("not found"));

    let missing_run = manager
        .get_run_detail(&run.run_id)
        .await
        .expect_err("run should be deleted via cascade");
    assert!(missing_run.to_string().contains("not found"));
}
