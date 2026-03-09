use std::time::Duration;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use rushdino_agent::{RunKind, RunListFilter, RunSnapshot, RunState};
use rushdino_common::Result;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRunRequest {
    pub message: String,
    pub conversation_id: Option<String>,
    pub session_id: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RunsQuery {
    pub kind: Option<RunKind>,
    pub state: Option<RunState>,
    pub source: Option<String>,
    pub channel_id: Option<String>,
    pub gateway_session_id: Option<String>,
    pub session_id: Option<String>,
    pub conversation_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WaitQuery {
    pub timeout_ms: Option<u64>,
    pub require_terminal: Option<bool>,
}

pub async fn create_run(
    State(state): State<AppState>,
    Json(payload): Json<CreateRunRequest>,
) -> Result<Json<RunSnapshot>> {
    let engine = state.engine()?;
    let session_id = payload
        .session_id
        .unwrap_or_else(|| format!("ui-run-{}", Uuid::new_v4()));
    let (run, _result_rx) = engine
        .submit_http_run(&session_id, payload.conversation_id, &payload.message)
        .await?;
    Ok(Json(run))
}

pub async fn list_runs(
    Query(query): Query<RunsQuery>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let items = engine
        .list_runs(RunListFilter {
            kind: query.kind,
            state: query.state,
            source: query.source,
            channel_id: query.channel_id,
            gateway_session_id: query.gateway_session_id,
            session_id: query.session_id,
            conversation_id: query.conversation_id,
            limit: query.limit.unwrap_or(50),
        })
        .await?;
    Ok(Json(serde_json::json!({ "items": items })))
}

pub async fn get_run(
    Path(run_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<rushdino_agent::RunDetail>> {
    let engine = state.engine()?;
    let detail = engine.get_run_detail(&run_id, 100).await?;
    Ok(Json(detail))
}

pub async fn abort_run(
    Path(run_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<RunSnapshot>> {
    let engine = state.engine()?;
    let snapshot = engine.abort_run(&run_id).await?;

    if let Some(approval) = state.gate.find_pending_for_run(&run_id).await {
        let _ = state
            .gate
            .resolve(&approval.session_id, &approval.request_id, false)
            .await;
    }

    let refreshed = engine.get_run(&run_id).await.unwrap_or(snapshot);
    Ok(Json(refreshed))
}

pub async fn wait_for_run(
    Path(run_id): Path<String>,
    Query(query): Query<WaitQuery>,
    State(state): State<AppState>,
) -> Result<Json<RunSnapshot>> {
    let engine = state.engine()?;
    let snapshot = engine
        .wait_for_run(
            &run_id,
            Duration::from_millis(query.timeout_ms.unwrap_or(25_000)),
            query.require_terminal.unwrap_or(false),
        )
        .await?;
    Ok(Json(snapshot))
}

pub async fn list_session_runs(
    Path(session_id): Path<String>,
    Query(query): Query<RunsQuery>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let items = engine
        .list_session_runs(&session_id, query.limit.unwrap_or(20))
        .await?;
    Ok(Json(serde_json::json!({ "items": items })))
}
