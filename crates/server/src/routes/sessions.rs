use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};

use rushdino_common::{AppError, Result};
use rushdino_providers::catalog::context_window_for_model;

use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionContextWindowSummary {
    pub provider: Option<String>,
    pub model: Option<String>,
    pub limit_tokens: Option<u32>,
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    pub usage_ratio: Option<f64>,
    pub measured_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
    pub status: String,
    pub message_count: usize,
    pub last_role: Option<String>,
    pub last_message_preview: Option<String>,
    pub pending_approval_count: usize,
    pub active_run_count: usize,
    pub queued_run_count: usize,
    pub last_run_id: Option<String>,
    pub context_window: SessionContextWindowSummary,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetail {
    pub session: SessionSummary,
    pub messages: Vec<rushdino_common::models::Message>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionsResponse {
    pub items: Vec<SessionSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    pub title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessageRequest {
    pub message: String,
}

pub async fn list_sessions(State(state): State<AppState>) -> Result<Json<SessionsResponse>> {
    let engine = state.engine()?;
    let conversations = engine.list_conversations().await?;
    let mut items = Vec::with_capacity(conversations.len());
    for conversation in conversations {
        items.push(build_session_summary(state.clone(), &conversation.id).await?);
    }
    Ok(Json(SessionsResponse { items }))
}

pub async fn create_session(
    State(state): State<AppState>,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<Json<SessionSummary>> {
    let engine = state.engine()?;
    let title = payload.title.trim();
    if title.is_empty() {
        return Err(AppError::Validation("title is required".to_owned()));
    }
    let session = engine.create_session(title).await?;
    Ok(Json(build_session_summary(state, &session.id).await?))
}

pub async fn get_session(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<SessionDetail>> {
    let engine = state.engine()?;
    let messages = engine.get_conversation_messages(&id).await?;
    let session = build_session_summary(state, &id).await?;
    Ok(Json(SessionDetail { session, messages }))
}

pub async fn send_session_message(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<SessionMessageRequest>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let response = engine.chat(&id, payload.message.trim()).await?;
    Ok(Json(serde_json::json!({
        "sessionId": id,
        "reply": response.content,
    })))
}

pub async fn reset_session(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<SessionSummary>> {
    let engine = state.engine()?;
    engine.reset_session(&id).await?;
    Ok(Json(build_session_summary(state, &id).await?))
}

pub async fn archive_session(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<SessionSummary>> {
    let engine = state.engine()?;
    engine.archive_session(&id).await?;
    Ok(Json(build_session_summary(state, &id).await?))
}

pub async fn delete_session(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let summary = build_session_summary(state.clone(), &id).await?;
    if summary.active_run_count > 0 {
        return Err(AppError::Validation(
            "cannot delete session with active runs".to_owned(),
        ));
    }
    if summary.pending_approval_count > 0 {
        return Err(AppError::Validation(
            "cannot delete session with pending approvals".to_owned(),
        ));
    }
    engine.delete_conversation(&id).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

async fn build_session_summary(state: AppState, conversation_id: &str) -> Result<SessionSummary> {
    let engine = state.engine()?;
    let conversation = engine.get_session_record(conversation_id).await?;
    let messages = engine
        .get_conversation_messages(conversation_id)
        .await
        .unwrap_or_default();
    let pending = state.gate.list_pending().await;
    let pending_approval_count = pending
        .iter()
        .filter(|request| request.conversation_id == conversation_id)
        .count();
    let runs = engine
        .list_session_runs(conversation_id, 10)
        .await
        .unwrap_or_default();
    let active_run_count = runs
        .iter()
        .filter(|run| {
            matches!(
                run.state,
                rushdino_agent::RunState::Running | rushdino_agent::RunState::AwaitingApproval
            )
        })
        .count();
    let queued_run_count = runs
        .iter()
        .filter(|run| run.state == rushdino_agent::RunState::Queued)
        .count();
    let last_message = messages.last();
    let latest_run = runs.first();
    // Usage metrics are stored under the run's conversation UUID, which may differ
    // from the session ID (e.g. "main"). Fall back to the session ID if no run exists.
    let usage_conversation_id = latest_run
        .and_then(|r| r.conversation_id.as_deref())
        .unwrap_or(conversation_id);
    let latest_usage = engine
        .latest_usage_metric(usage_conversation_id)
        .await
        .ok()
        .flatten();
    let model = latest_usage
        .as_ref()
        .map(|usage| usage.model.clone())
        .or_else(|| latest_run.map(|run| run.model.clone()));
    let provider = latest_usage
        .as_ref()
        .map(|usage| usage.provider.clone())
        .or_else(|| latest_run.map(|run| run.provider.clone()));
    let limit_tokens = model.as_deref().and_then(context_window_for_model);
    let prompt_tokens = latest_usage.as_ref().map(|usage| usage.prompt_tokens);
    let completion_tokens = latest_usage.as_ref().map(|usage| usage.completion_tokens);
    let total_tokens = latest_usage.as_ref().map(|usage| usage.total_tokens);
    let usage_ratio = match (prompt_tokens, limit_tokens) {
        (Some(prompt), Some(limit)) if limit > 0 => Some(prompt as f64 / f64::from(limit)),
        _ => None,
    };
    let now = Utc::now();
    let status = if conversation.archived_at.is_some() {
        "archived"
    } else if pending_approval_count > 0 {
        "awaiting_approval"
    } else if runs
        .iter()
        .any(|run| run.state == rushdino_agent::RunState::Blocked)
    {
        "blocked"
    } else if active_run_count > 0
        || now - conversation.conversation.updated_at <= Duration::minutes(30)
    {
        "active"
    } else {
        "idle"
    };

    Ok(SessionSummary {
        id: conversation.conversation.id,
        title: conversation.conversation.title,
        created_at: conversation.conversation.created_at.to_rfc3339(),
        updated_at: conversation.conversation.updated_at.to_rfc3339(),
        archived_at: conversation.archived_at.map(|value| value.to_rfc3339()),
        status: status.to_owned(),
        message_count: messages.len(),
        last_role: last_message.map(|message| format!("{:?}", message.role).to_lowercase()),
        last_message_preview: last_message.map(|message| truncate_preview(&message.content)),
        pending_approval_count,
        active_run_count,
        queued_run_count,
        last_run_id: latest_run.map(|run| run.id.clone()),
        context_window: SessionContextWindowSummary {
            provider,
            model,
            limit_tokens,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            usage_ratio,
            measured_at: latest_usage.map(|usage| usage.created_at),
        },
    })
}

fn truncate_preview(content: &str) -> String {
    let trimmed = content.trim();
    if trimmed.chars().count() <= 100 {
        return trimmed.to_owned();
    }
    trimmed.chars().take(100).collect::<String>() + "..."
}
