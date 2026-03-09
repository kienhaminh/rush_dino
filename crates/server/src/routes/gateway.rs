use std::collections::HashMap;

use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{Duration, Utc};
use serde::Serialize;

use rushdino_agent::{RunListFilter, RunState};
use rushdino_common::Result;
use rushdino_gateway::GatewayAdapterState;

use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayAdaptersResponse {
    pub items: Vec<GatewayAdapterState>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewaySessionSummary {
    pub id: String,
    pub channel_id: String,
    pub sender_id: String,
    pub conversation_id: String,
    pub last_active: String,
    pub last_run_id: Option<String>,
    pub last_delivery_at: Option<String>,
    pub last_error: Option<String>,
    pub status: String,
    pub pending_approval_count: usize,
    pub active_run_count: usize,
    pub queued_run_count: usize,
    pub last_run_state: Option<RunState>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewaySessionsResponse {
    pub items: Vec<GatewaySessionSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayChannelActivity {
    pub channel_id: String,
    pub session_count: usize,
    pub recent_run_count: usize,
    pub active_run_count: usize,
    pub blocked_run_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayFailureRecord {
    pub kind: String,
    pub channel_id: Option<String>,
    pub session_id: Option<String>,
    pub run_id: Option<String>,
    pub message: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewaySummaryResponse {
    pub generated_at: String,
    pub adapters: Vec<GatewayAdapterState>,
    pub sessions: GatewaySessionCounts,
    pub runs: GatewayRunCounts,
    pub channel_activity: Vec<GatewayChannelActivity>,
    pub recent_failures: Vec<GatewayFailureRecord>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewaySessionCounts {
    pub total_count: usize,
    pub active_last_hour: usize,
    pub most_recent_id: Option<String>,
    pub most_recent_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayRunCounts {
    pub total_count: usize,
    pub active_count: usize,
    pub blocked_count: usize,
    pub failed_count: usize,
    pub most_recent_id: Option<String>,
}

pub async fn list_gateway_adapters(
    State(state): State<AppState>,
) -> Result<Json<GatewayAdaptersResponse>> {
    Ok(Json(GatewayAdaptersResponse {
        items: state.gateway_state.list_adapters().await,
    }))
}

pub async fn list_gateway_sessions(
    State(state): State<AppState>,
) -> Result<Json<GatewaySessionsResponse>> {
    let engine = state.engine_opt();
    let pending = state.gate.list_pending().await;
    let records = state.gateway_sessions.list_sessions(100).await?;
    let now = Utc::now();
    let mut items = Vec::with_capacity(records.len());

    for record in records {
        let runs = if let Some(engine) = engine.as_ref() {
            engine
                .list_runs(RunListFilter {
                    source: Some("gateway".to_owned()),
                    gateway_session_id: Some(record.id.clone()),
                    limit: 10,
                    ..RunListFilter::default()
                })
                .await
                .unwrap_or_default()
        } else {
            Vec::new()
        };
        let pending_approval_count = pending
            .iter()
            .filter(|request| request.conversation_id == record.conversation_id)
            .count();
        let active_run_count = runs
            .iter()
            .filter(|run| matches!(run.state, RunState::Running | RunState::AwaitingApproval))
            .count();
        let queued_run_count = runs
            .iter()
            .filter(|run| run.state == RunState::Queued)
            .count();
        let status = if pending_approval_count > 0 {
            "awaiting_approval"
        } else if runs.iter().any(|run| run.state == RunState::Blocked) {
            "blocked"
        } else if active_run_count > 0 {
            "active"
        } else if record.last_error.is_some() {
            "degraded"
        } else if parse_recent(&record.last_active, now) {
            "active"
        } else {
            "idle"
        };

        items.push(GatewaySessionSummary {
            id: record.id,
            channel_id: record.channel_id,
            sender_id: record.sender_id,
            conversation_id: record.conversation_id,
            last_active: record.last_active,
            last_run_id: record.last_run_id,
            last_delivery_at: record.last_delivery_at,
            last_error: record.last_error,
            status: status.to_owned(),
            pending_approval_count,
            active_run_count,
            queued_run_count,
            last_run_state: runs.first().map(|run| run.state),
        });
    }

    Ok(Json(GatewaySessionsResponse { items }))
}

pub async fn reset_gateway_session(
    Path(session_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    state.gateway_sessions.reset_session(&session_id).await?;
    Ok(Json(serde_json::json!({
        "reset": true,
        "id": session_id,
    })))
}

pub async fn restart_gateway_adapter(
    Path(channel_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    state.gateway_control.restart_adapter(&channel_id).await?;
    Ok(Json(serde_json::json!({
        "restarted": true,
        "channelId": channel_id,
    })))
}

pub async fn get_gateway_summary(
    State(state): State<AppState>,
) -> Result<Json<GatewaySummaryResponse>> {
    let adapters = state.gateway_state.list_adapters().await;
    let sessions = state.gateway_sessions.list_sessions(100).await?;
    let runs = if let Some(engine) = state.engine_opt() {
        engine
            .list_runs(RunListFilter {
                source: Some("gateway".to_owned()),
                limit: 100,
                ..RunListFilter::default()
            })
            .await?
    } else {
        Vec::new()
    };
    let now = Utc::now();

    let mut channel_activity_map: HashMap<String, GatewayChannelActivity> = HashMap::new();
    for session in &sessions {
        channel_activity_map
            .entry(session.channel_id.clone())
            .or_insert_with(|| GatewayChannelActivity {
                channel_id: session.channel_id.clone(),
                session_count: 0,
                recent_run_count: 0,
                active_run_count: 0,
                blocked_run_count: 0,
            })
            .session_count += 1;
    }
    for run in &runs {
        let Some(channel_id) = run.channel_id.clone() else {
            continue;
        };
        let entry = channel_activity_map
            .entry(channel_id.clone())
            .or_insert_with(|| GatewayChannelActivity {
                channel_id,
                session_count: 0,
                recent_run_count: 0,
                active_run_count: 0,
                blocked_run_count: 0,
            });
        entry.recent_run_count += 1;
        if matches!(run.state, RunState::Running | RunState::AwaitingApproval) {
            entry.active_run_count += 1;
        }
        if run.state == RunState::Blocked {
            entry.blocked_run_count += 1;
        }
    }

    let mut recent_failures = Vec::new();
    for adapter in &adapters {
        if let Some(message) = adapter.last_error.clone() {
            recent_failures.push(GatewayFailureRecord {
                kind: "adapter".to_owned(),
                channel_id: Some(adapter.channel_id.clone()),
                session_id: None,
                run_id: None,
                message,
                created_at: adapter
                    .last_event_at
                    .clone()
                    .unwrap_or_else(|| now.to_rfc3339()),
            });
        }
    }
    for session in &sessions {
        if let Some(message) = session.last_error.clone() {
            recent_failures.push(GatewayFailureRecord {
                kind: "session".to_owned(),
                channel_id: Some(session.channel_id.clone()),
                session_id: Some(session.id.clone()),
                run_id: session.last_run_id.clone(),
                message,
                created_at: session
                    .last_delivery_at
                    .clone()
                    .unwrap_or_else(|| session.last_active.clone()),
            });
        }
    }
    for run in runs
        .iter()
        .filter(|run| matches!(run.state, RunState::Failed | RunState::Blocked))
        .take(8)
    {
        recent_failures.push(GatewayFailureRecord {
            kind: "run".to_owned(),
            channel_id: run.channel_id.clone(),
            session_id: run.gateway_session_id.clone(),
            run_id: Some(run.id.clone()),
            message: run
                .error
                .clone()
                .or_else(|| run.policy.reason.clone())
                .unwrap_or_else(|| "gateway run requires attention".to_owned()),
            created_at: run.updated_at.clone(),
        });
    }
    recent_failures.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    recent_failures.truncate(10);

    let mut channel_activity = channel_activity_map.into_values().collect::<Vec<_>>();
    channel_activity.sort_by(|left, right| left.channel_id.cmp(&right.channel_id));

    Ok(Json(GatewaySummaryResponse {
        generated_at: now.to_rfc3339(),
        adapters,
        sessions: GatewaySessionCounts {
            total_count: sessions.len(),
            active_last_hour: sessions
                .iter()
                .filter(|session| parse_recent(&session.last_active, now))
                .count(),
            most_recent_id: sessions.first().map(|session| session.id.clone()),
            most_recent_at: sessions.first().map(|session| session.last_active.clone()),
        },
        runs: GatewayRunCounts {
            total_count: runs.len(),
            active_count: runs
                .iter()
                .filter(|run| matches!(run.state, RunState::Running | RunState::AwaitingApproval))
                .count(),
            blocked_count: runs
                .iter()
                .filter(|run| run.state == RunState::Blocked)
                .count(),
            failed_count: runs
                .iter()
                .filter(|run| run.state == RunState::Failed)
                .count(),
            most_recent_id: runs.first().map(|run| run.id.clone()),
        },
        channel_activity,
        recent_failures,
    }))
}

fn parse_recent(value: &str, now: chrono::DateTime<Utc>) -> bool {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|parsed| now - parsed.with_timezone(&Utc) <= Duration::hours(1))
        .unwrap_or(false)
}
