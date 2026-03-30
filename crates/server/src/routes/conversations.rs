use axum::{extract::Path, extract::State, Json};
use serde::Serialize;
use tracing::debug;

use rushdino_agent::InputRequest;
use rushdino_common::Result;
use rushdino_providers::catalog::context_window_for_model;

use crate::{routes::usage_metrics::compute_usage_costs, state::AppState};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMetrics {
    pub provider: String,
    pub model: String,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub limit_tokens: Option<i64>,
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
    pub response_time_ms: Option<i64>,
    pub measured_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDetail {
    pub id: String,
    pub messages: Vec<rushdino_common::models::Message>,
    pub pending_input_requests: Vec<InputRequest>,
    pub latest_metrics: Option<ConversationMetrics>,
}

pub async fn list_conversations(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let items = engine.list_conversations().await?;
    Ok(Json(serde_json::json!({"items": items})))
}

pub async fn get_conversation(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<ConversationDetail>> {
    let engine = state.engine()?;
    let messages = engine.get_conversation_messages(&id).await?;
    let pending_input_requests = state.input_gate.list_pending_for_conversation(&id).await;
    let latest_metrics = build_latest_metrics(&engine, &id).await.ok().flatten();
    Ok(Json(ConversationDetail {
        id,
        messages,
        pending_input_requests,
        latest_metrics,
    }))
}

async fn build_latest_metrics(
    engine: &rushdino_agent::AgentEngine,
    conversation_id: &str,
) -> Result<Option<ConversationMetrics>> {
    let Some(usage) = engine.latest_usage_metric(conversation_id).await? else {
        return Ok(None);
    };
    let limit_tokens = context_window_for_model(&usage.model).map(|v| v as i64);
    let (input_cost, output_cost) = compute_usage_costs(
        &usage.provider,
        &usage.model,
        usage.prompt_tokens,
        usage.completion_tokens,
    );
    let response_time_ms = engine
        .latest_run_timing_for_conversation(conversation_id)
        .await
        .unwrap_or_else(|err| {
            debug!("Could not fetch run timing for conversation {conversation_id}: {err}");
            None
        });
    Ok(Some(ConversationMetrics {
        provider: usage.provider,
        model: usage.model,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
        limit_tokens,
        input_cost,
        output_cost,
        total_cost: input_cost + output_cost,
        response_time_ms,
        measured_at: usage.created_at,
    }))
}

pub async fn delete_conversation(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    engine.delete_conversation(&id).await?;
    Ok(Json(serde_json::json!({"deleted": true})))
}
