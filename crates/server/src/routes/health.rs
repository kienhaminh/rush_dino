use axum::{extract::State, Json};
use serde_json::json;

use crate::provider_runtime::provider_kind_label;
use crate::state::AppState;

pub async fn healthz(State(state): State<AppState>) -> Json<serde_json::Value> {

    let runtime = state.runtime_status();
    Json(json!({
        "status": if runtime.unavailable_error.is_some() { "degraded" } else { "ok" },
        "uptime_secs": state.start_time.elapsed().as_secs(),
        "provider": runtime
            .effective_provider_kind
            .as_ref()
            .map(provider_kind_label)
            .map(str::to_owned)
            .unwrap_or_else(|| "unavailable".to_owned()),
        "effective_profile_id": runtime.effective_profile_id,
        "runtime_unavailable_error": runtime.unavailable_error,
    }))
}
