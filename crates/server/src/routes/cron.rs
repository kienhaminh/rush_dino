use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;

use rushdino_agent::{CreateCronJobInput, UpdateCronJobInput};
use rushdino_common::Result;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CronRunsQuery {
    pub limit: Option<i64>,
}

pub async fn list_cron_jobs(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let items = engine.list_cron_jobs().await?;
    Ok(Json(serde_json::json!({ "items": items })))
}

pub async fn get_cron_job(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let job = engine.get_cron_job(&id).await?;
    let runs = engine.list_cron_runs(&id, 20).await?;
    Ok(Json(serde_json::json!({ "job": job, "runs": runs })))
}

pub async fn create_cron_job(
    State(state): State<AppState>,
    Json(payload): Json<CreateCronJobInput>,
) -> Result<Json<rushdino_agent::CronJobRecord>> {
    let engine = state.engine()?;
    let job = engine.create_cron_job(payload).await?;
    Ok(Json(job))
}

pub async fn update_cron_job(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<UpdateCronJobInput>,
) -> Result<Json<rushdino_agent::CronJobRecord>> {
    let engine = state.engine()?;
    let job = engine.update_cron_job(&id, payload).await?;
    Ok(Json(job))
}

pub async fn pause_cron_job(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<rushdino_agent::CronJobRecord>> {
    let engine = state.engine()?;
    let job = engine.pause_cron_job(&id).await?;
    Ok(Json(job))
}

pub async fn resume_cron_job(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<rushdino_agent::CronJobRecord>> {
    let engine = state.engine()?;
    let job = engine.resume_cron_job(&id).await?;
    Ok(Json(job))
}

pub async fn run_cron_job(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let (job, session_id, workflow_run_id) = engine.run_cron_job(&id, "manual").await?;
    Ok(Json(serde_json::json!({
        "job": job,
        "sessionId": session_id,
        "workflowRunId": workflow_run_id,
    })))
}

pub async fn delete_cron_job(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    engine.delete_cron_job(&id).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

pub async fn list_cron_runs(
    Path(id): Path<String>,
    Query(query): Query<CronRunsQuery>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let runs = engine
        .list_cron_runs(&id, query.limit.unwrap_or(20))
        .await?;
    Ok(Json(serde_json::json!({ "items": runs })))
}
