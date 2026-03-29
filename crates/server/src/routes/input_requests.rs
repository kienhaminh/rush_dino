use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use rushdino_agent::{InputRequestResult, InputRequestStatus};
use rushdino_common::{AppError, Result};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputRequestDecision {
    pub status: InputRequestStatus,
    #[serde(default)]
    pub values: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputRequestResponse {
    pub request_id: String,
    pub status: InputRequestStatus,
}

pub async fn resolve_input_request(
    State(state): State<AppState>,
    Path(request_id): Path<String>,
    Json(body): Json<InputRequestDecision>,
) -> Result<Json<InputRequestResponse>> {
    let result = match body.status {
        InputRequestStatus::Submitted => InputRequestResult::submitted(
            body.values.ok_or_else(|| {
                AppError::Validation("submitted input request requires values".to_owned())
            })?,
        ),
        InputRequestStatus::Cancelled => {
            if body.values.is_some() {
                return Err(AppError::Validation(
                    "cancelled input request must not include values".to_owned(),
                ));
            }
            InputRequestResult::cancelled()
        }
    };

    let request = state.input_gate.resolve(&request_id, result.clone()).await?;

    let _ = state
        .runtime_logs
        .insert(
            "info",
            "input_request",
            "input request resolved",
            Some(json!({
                "requestId": request_id.clone(),
                "runId": request.run_id,
                "conversationId": request.conversation_id,
                "status": result.status,
            })),
        )
        .await;

    Ok(Json(InputRequestResponse {
        request_id,
        status: result.status,
    }))
}
