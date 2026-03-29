use axum::{extract::Query, extract::State, Json};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use rushdino_agent::AgentProgressLane;
use rushdino_common::Result;

use crate::state::AppState;

const DEFAULT_LOOKBACK_MINUTES: u32 = 180;
const DEFAULT_PER_COLUMN: usize = 8;
const DEFAULT_ACTIVE_WINDOW_SECONDS: u32 = 90;

#[derive(Debug, Deserialize)]
pub struct AgentProgressQuery {
    pub lookback_minutes: Option<u32>,
    pub per_column: Option<usize>,
    pub active_window_seconds: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProgressResponse {
    pub generated_at: String,
    pub lookback_minutes: u32,
    pub active_window_seconds: u32,
    pub lanes: Vec<AgentProgressLane>,
}

pub async fn get_agent_progress(
    State(state): State<AppState>,
    Query(query): Query<AgentProgressQuery>,
) -> Result<Json<AgentProgressResponse>> {
    let engine = state.engine()?;
    let lookback_minutes = query
        .lookback_minutes
        .unwrap_or(DEFAULT_LOOKBACK_MINUTES)
        .clamp(1, 24 * 60);
    let per_column = query.per_column.unwrap_or(DEFAULT_PER_COLUMN).clamp(1, 50);
    let active_window_seconds = query
        .active_window_seconds
        .unwrap_or(DEFAULT_ACTIVE_WINDOW_SECONDS)
        .clamp(1, 3600);

    let lanes = engine
        .build_agent_progress_lanes(lookback_minutes, per_column, active_window_seconds)
        .await?;

    Ok(Json(AgentProgressResponse {
        generated_at: Utc::now().to_rfc3339(),
        lookback_minutes,
        active_window_seconds,
        lanes,
    }))
}

#[cfg(test)]
#[path = "agent_progress_tests.rs"]
mod tests;
