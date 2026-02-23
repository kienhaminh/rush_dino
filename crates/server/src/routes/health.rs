use axum::{extract::State, Json};
use serde_json::json;

use crate::state::AppState;

pub async fn healthz(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "uptime_secs": state.start_time.elapsed().as_secs(),
        "provider": format!("{:?}", state.config.active_provider),
    }))
}
