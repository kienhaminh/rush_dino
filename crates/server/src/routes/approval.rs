use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use rushdino_common::{AppError, Result};

use crate::state::AppState;

/// Body for `POST /api/approval/{request_id}`.
#[derive(Debug, Deserialize)]
pub struct ApprovalDecision {
    pub approved: bool,
    /// The session_id returned in the `pending_approval` chat response.
    pub session_id: String,
}

/// Response for both approval routes.
#[derive(Debug, Serialize)]
pub struct ApprovalResponse {
    pub request_id: String,
    pub status: String,
}

/// `POST /api/approval/{request_id}` — approve or deny a pending tool execution.
///
/// Clients receive the `request_id` and `session_id` in the chat response body
/// when `status == "pending_approval"`.  They call this endpoint to resolve it.
pub async fn resolve_approval(
    State(state): State<AppState>,
    Path(request_id): Path<String>,
    Json(body): Json<ApprovalDecision>,
) -> Result<Json<ApprovalResponse>> {
    state.gate.resolve(&body.session_id, &request_id, body.approved).await?;

    let status = if body.approved { "approved" } else { "denied" };
    Ok(Json(ApprovalResponse { request_id, status: status.to_owned() }))
}

/// `GET /api/approval/{request_id}` — check whether a pending approval request
/// still exists (i.e., has not yet been resolved or timed out).
pub async fn get_approval_status(
    State(state): State<AppState>,
    Path(request_id): Path<String>,
) -> Result<Json<ApprovalResponse>> {
    if state.gate.has_pending(&request_id).await {
        Ok(Json(ApprovalResponse { request_id, status: "pending".to_owned() }))
    } else {
        Err(AppError::NotFound(format!("approval request '{request_id}' not found or already resolved")))
    }
}
