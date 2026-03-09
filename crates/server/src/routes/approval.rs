use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalQueueItem {
    pub request_id: String,
    pub session_id: String,
    pub conversation_id: String,
    pub run_id: Option<String>,
    pub tool: String,
    pub args: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalAuditItem {
    pub id: String,
    pub status: String,
    pub tool: Option<String>,
    pub request_id: Option<String>,
    pub run_id: Option<String>,
    pub session_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalsResponse {
    pub pending: Vec<ApprovalQueueItem>,
    pub recent: Vec<ApprovalAuditItem>,
}

pub async fn list_approvals(State(state): State<AppState>) -> Result<Json<ApprovalsResponse>> {
    let pending = state
        .gate
        .list_pending()
        .await
        .into_iter()
        .map(|request| ApprovalQueueItem {
            request_id: request.request_id,
            session_id: request.session_id,
            conversation_id: request.conversation_id,
            run_id: request.run_id,
            tool: request.tool,
            args: request.args,
        })
        .collect::<Vec<_>>();

    let recent = state
        .runtime_logs
        .list(None, None, None, None, 100)
        .await?
        .into_iter()
        .filter(|row| row.target == "approval")
        .take(12)
        .map(|row| {
            let fields = row
                .fields
                .as_ref()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok());
            ApprovalAuditItem {
                id: row.id,
                status: fields
                    .as_ref()
                    .and_then(|value| value.get("status"))
                    .and_then(|value| value.as_str())
                    .unwrap_or("recorded")
                    .to_owned(),
                tool: fields
                    .as_ref()
                    .and_then(|value| value.get("tool"))
                    .and_then(|value| value.as_str())
                    .map(ToOwned::to_owned),
                request_id: fields
                    .as_ref()
                    .and_then(|value| value.get("requestId"))
                    .and_then(|value| value.as_str())
                    .map(ToOwned::to_owned),
                run_id: fields
                    .as_ref()
                    .and_then(|value| value.get("runId"))
                    .and_then(|value| value.as_str())
                    .map(ToOwned::to_owned),
                session_id: fields
                    .as_ref()
                    .and_then(|value| value.get("sessionId"))
                    .and_then(|value| value.as_str())
                    .map(ToOwned::to_owned),
                created_at: row.created_at,
            }
        })
        .collect::<Vec<_>>();

    Ok(Json(ApprovalsResponse { pending, recent }))
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
    let request = state
        .gate
        .resolve(&body.session_id, &request_id, body.approved)
        .await?;

    let status = if body.approved { "approved" } else { "denied" };
    let _ = state
        .runtime_logs
        .insert(
            "info",
            "approval",
            "approval decision recorded",
            Some(json!({
                "requestId": request_id.clone(),
                "runId": request.run_id,
                "sessionId": body.session_id,
                "tool": request.tool,
                "status": status,
            })),
        )
        .await;
    Ok(Json(ApprovalResponse {
        request_id,
        status: status.to_owned(),
    }))
}

/// `GET /api/approval/{request_id}` — check whether a pending approval request
/// still exists (i.e., has not yet been resolved or timed out).
pub async fn get_approval_status(
    State(state): State<AppState>,
    Path(request_id): Path<String>,
) -> Result<Json<ApprovalResponse>> {
    if state.gate.has_pending(&request_id).await {
        Ok(Json(ApprovalResponse {
            request_id,
            status: "pending".to_owned(),
        }))
    } else {
        Err(AppError::NotFound(format!(
            "approval request '{request_id}' not found or already resolved"
        )))
    }
}
