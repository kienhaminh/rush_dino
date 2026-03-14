use std::time::Duration;

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use rushdino_common::{AppError, Result};
use rushdino_security::{
    taint::TaintLevel,
    validation::{check_body_size, scan_prompt_injection},
};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub conversation_id: Option<String>,
    pub message: String,
}

/// Normal completed response.
#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub run_id: String,
    pub conversation_id: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rich_content: Option<rushdino_common::RichContent>,
    pub finish_reason: String,
    pub tool_calls: Vec<rushdino_common::models::ToolCall>,
    /// Either `"completed"` or `"pending_approval"`.
    pub status: String,
    /// Present when `status == "pending_approval"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_approval: Option<PendingApprovalInfo>,
}

/// Information returned to the REST client so it can resolve a pending approval.
#[derive(Debug, Serialize)]
pub struct PendingApprovalInfo {
    pub request_id: String,
    pub session_id: String,
    pub tool: String,
}

pub async fn chat(
    State(state): State<AppState>,
    Json(request): Json<ChatRequest>,
) -> Result<Json<ChatResponse>> {
    let engine = state.engine()?;
    // Layer 4d: enforce message size limit.
    check_body_size(request.message.len())
        .map_err(|e| AppError::Validation(format!("message too large: {e}")))?;

    // Layer 4a: scan for prompt injection before forwarding to the agent.
    let scan = scan_prompt_injection(&request.message);
    if scan.taint >= TaintLevel::Malicious {
        tracing::warn!(
            score = scan.score,
            matched = ?scan.matched,
            "prompt injection detected in HTTP chat request — rejecting"
        );
        return Err(AppError::Validation(format!(
            "message rejected: prompt injection detected (score={:.2})",
            scan.score
        )));
    }
    if scan.taint == TaintLevel::Suspicious {
        tracing::warn!(
            score = scan.score,
            matched = ?scan.matched,
            "suspicious prompt injection signal — proceeding with caution"
        );
    }

    // Generate an ephemeral session_id so the approval gate can route requests
    // back to this HTTP handler (closing the gap where HTTP bypassed the gate).
    let session_id = Uuid::new_v4().to_string();
    let mut approval_rx = state.gate.register_session(&session_id).await;

    let gate = state.gate.clone();
    let message = request.message.clone();
    let (run, mut result_rx) = engine
        .submit_http_run(&session_id, request.conversation_id.clone(), &message)
        .await?;

    tokio::select! {
        approval = approval_rx.recv() => {
            let approval_request = approval.ok_or_else(|| {
                AppError::Agent("approval channel closed before the run completed".to_owned())
            })?;

            tracing::info!(
                request_id = %approval_request.request_id,
                run_id = ?approval_request.run_id,
                tool = %approval_request.tool,
                "HTTP chat: dangerous tool requires approval"
            );

            let cleanup_gate = gate.clone();
            let cleanup_engine = engine.clone();
            let cleanup_session = session_id.clone();
            let cleanup_run_id = run.id.clone();
            tokio::spawn(async move {
                let _ = cleanup_engine
                    .wait_for_run(&cleanup_run_id, Duration::from_secs(300), true)
                    .await;
                cleanup_gate.unregister_session(&cleanup_session).await;
            });

            Ok(Json(ChatResponse {
                run_id: run.id,
                conversation_id: approval_request.conversation_id,
                content: String::new(),
                rich_content: None,
                finish_reason: "pending_approval".to_owned(),
                tool_calls: Vec::new(),
                status: "pending_approval".to_owned(),
                pending_approval: Some(PendingApprovalInfo {
                    request_id: approval_request.request_id,
                    session_id,
                    tool: approval_request.tool,
                }),
            }))
        }
        result = &mut result_rx => {
            gate.unregister_session(&session_id).await;
            let response = result
                .map_err(|err| AppError::Agent(format!("run result channel dropped: {err}")))?
                .map_err(AppError::Agent)?;

            Ok(Json(ChatResponse {
                run_id: run.id,
                conversation_id: run
                    .conversation_id
                    .unwrap_or_else(|| Uuid::new_v4().to_string()),
                content: response.content,
                rich_content: response.rich_content,
                finish_reason: response.finish_reason,
                tool_calls: response.tool_calls,
                status: "completed".to_owned(),
                pending_approval: None,
            }))
        }
    }
}
