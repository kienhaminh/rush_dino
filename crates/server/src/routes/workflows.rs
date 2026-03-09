use axum::{extract::Path, extract::Query, extract::State, Json};
use serde::Deserialize;

use rushdino_agent::{
    CreateWorkflowInput, UpdateWorkflowInput, WorkflowSource, WorkflowStatus, WorkflowStepInput,
};
use rushdino_common::Result;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkflowRequest {
    pub name: String,
    pub description: Option<String>,
    pub status: Option<WorkflowStatus>,
    pub steps: Vec<WorkflowStepInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkflowRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub status: Option<WorkflowStatus>,
    pub steps: Option<Vec<WorkflowStepInput>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartWorkflowRunRequest {
    pub input: Option<String>,
    pub triggered_by: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RunsQuery {
    pub limit: Option<i64>,
}

pub async fn list_workflows(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let items = engine.list_workflows().await?;
    Ok(Json(serde_json::json!({ "items": items })))
}

pub async fn get_workflow(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<rushdino_agent::WorkflowDetail>> {
    let engine = state.engine()?;
    let workflow = engine.get_workflow(&id).await?;
    Ok(Json(workflow))
}

pub async fn create_workflow(
    State(state): State<AppState>,
    Json(payload): Json<CreateWorkflowRequest>,
) -> Result<Json<rushdino_agent::WorkflowDetail>> {
    let engine = state.engine()?;
    let workflow = engine
        .create_workflow(
            CreateWorkflowInput {
                name: payload.name,
                description: payload.description.unwrap_or_default(),
                status: payload.status.unwrap_or(WorkflowStatus::Draft),
                steps: payload.steps,
            },
            WorkflowSource::Manual,
            "user",
        )
        .await?;

    Ok(Json(workflow))
}

pub async fn update_workflow(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<UpdateWorkflowRequest>,
) -> Result<Json<rushdino_agent::WorkflowDetail>> {
    let engine = state.engine()?;
    let workflow = engine
        .update_workflow(
            &id,
            UpdateWorkflowInput {
                name: payload.name,
                description: payload.description,
                status: payload.status,
                steps: payload.steps,
            },
        )
        .await?;

    Ok(Json(workflow))
}

pub async fn delete_workflow(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    engine.delete_workflow(&id).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

pub async fn start_workflow_run(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<StartWorkflowRunRequest>,
) -> Result<Json<rushdino_agent::WorkflowRunStartResponse>> {
    let engine = state.engine()?;
    let response = engine
        .start_workflow_run(
            &id,
            payload.triggered_by.as_deref().unwrap_or("user"),
            payload.input.as_deref().unwrap_or(""),
        )
        .await?;
    Ok(Json(response))
}

pub async fn list_workflow_runs(
    Path(id): Path<String>,
    Query(query): Query<RunsQuery>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let items = engine
        .list_workflow_runs(&id, query.limit.unwrap_or(20))
        .await?;
    Ok(Json(serde_json::json!({ "items": items })))
}

pub async fn get_workflow_run(
    Path(run_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<rushdino_agent::WorkflowRunDetail>> {
    let engine = state.engine()?;
    let run = engine.get_workflow_run(&run_id).await?;
    Ok(Json(run))
}
