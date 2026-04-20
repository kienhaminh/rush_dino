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
    rushdino_common::db::run_migrations(&pool)
        .await
        .expect("run migrations");

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
            skills: None,
            color: None,
            model: None,
            inbox_enabled: false,
            claims_tasks: true,
            claim_tags: Vec::new(),
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
    let err = tool.execute(json!({})).await.expect_err("missing action");
    assert!(err.to_string().contains("action is required"));
}
