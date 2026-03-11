use axum::{extract::State, Json};
use chrono::{Duration, Utc};
use serde::Serialize;

use rushdino_common::Result;
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
pub struct SessionsResponse {
    pub items: Vec<SessionSummary>,
}

pub async fn list_sessions(State(state): State<AppState>) -> Result<Json<SessionsResponse>> {
    let engine = state.engine()?;
    let conversations = engine.list_conversations().await?;
    let pending = state.gate.list_pending().await;
    let now = Utc::now();

    let mut items = Vec::with_capacity(conversations.len());
    for conversation in conversations {
        let messages = engine
            .get_conversation_messages(&conversation.id)
            .await
            .unwrap_or_default();
        let pending_approval_count = pending
            .iter()
            .filter(|request| request.conversation_id == conversation.id)
            .count();
        let runs = engine
            .list_session_runs(&conversation.id, 10)
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
        let latest_usage = engine
            .latest_usage_metric(&conversation.id)
            .await
            .ok()
            .flatten();
        let latest_run = runs.first();
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
        let status = if pending_approval_count > 0 {
            "awaiting_approval"
        } else if runs
            .iter()
            .any(|run| run.state == rushdino_agent::RunState::Blocked)
        {
            "blocked"
        } else if active_run_count > 0 {
            "active"
        } else if now - conversation.updated_at <= Duration::minutes(30) {
            "active"
        } else {
            "idle"
        };

        items.push(SessionSummary {
            id: conversation.id,
            title: conversation.title,
            created_at: conversation.created_at.to_rfc3339(),
            updated_at: conversation.updated_at.to_rfc3339(),
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
        });
    }

    Ok(Json(SessionsResponse { items }))
}

fn truncate_preview(content: &str) -> String {
    let trimmed = content.trim();
    if trimmed.chars().count() <= 100 {
        return trimmed.to_owned();
    }
    trimmed.chars().take(100).collect::<String>() + "..."
}
