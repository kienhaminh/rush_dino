use std::time::Duration;

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use rushdino_agent::tools::shell_exec::{with_tool_execution_context, ToolExecutionContext};
use rushdino_common::{AppError, Result};
use rushdino_security::{
    taint::TaintLevel,
    validation::{check_body_size, scan_prompt_injection},
};

use crate::state::AppState;

/// Timeout to wait for an approval request from the agent during an HTTP chat.
const HTTP_APPROVAL_POLL_TIMEOUT: Duration = Duration::from_millis(500);

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub conversation_id: Option<String>,
    pub message: String,
}

/// Normal completed response.
#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub conversation_id: String,
    pub content: String,
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

    let engine = state.engine.clone();
    let gate = state.gate.clone();
    let conv_id = request.conversation_id.clone();
    let message = request.message.clone();
    let session_id_clone = session_id.clone();

    // Run the agent in a background task so we can concurrently monitor the
    // approval channel.
    let agent_task = tokio::spawn(async move {
        let ctx = ToolExecutionContext {
            session_id: Some(session_id_clone),
            conversation_id: conv_id.clone(),
            delegation_depth: 0,
        };
        with_tool_execution_context(ctx, async move {
            engine.chat_or_create(conv_id, &message).await
        })
        .await
    });

    // Poll for an approval request from the agent for a short window.
    // If none arrives (non-dangerous command path), just await the agent result.
    let approval_check =
        tokio::time::timeout(HTTP_APPROVAL_POLL_TIMEOUT, approval_rx.recv()).await;

    if let Ok(Some(approval_request)) = approval_check {
        // A dangerous tool triggered the approval gate.
        // Return the pending state to the caller so they can resolve via
        // POST /api/approval/{request_id}.
        tracing::info!(
            request_id = %approval_request.request_id,
            tool = %approval_request.tool,
            "HTTP chat: dangerous tool requires approval"
        );

        // Unregister the session here — the client will resolve directly via the gate.
        // The background agent task will remain blocked in gate.request_approval()
        // until the client calls POST /api/approval/{request_id}.
        let _ = agent_task; // keep it alive (it's detached)

        return Ok(Json(ChatResponse {
            conversation_id: approval_request.conversation_id,
            content: String::new(),
            finish_reason: "pending_approval".to_owned(),
            tool_calls: Vec::new(),
            status: "pending_approval".to_owned(),
            pending_approval: Some(PendingApprovalInfo {
                request_id: approval_request.request_id,
                session_id,
                tool: approval_request.tool,
            }),
        }));
    }

    // No approval needed — await the agent result normally.
    gate.unregister_session(&session_id).await;
    let (conversation_id, response) = agent_task
        .await
        .map_err(|e| AppError::Agent(format!("agent task panicked: {e}")))?
        .map_err(|e| e)?;

    Ok(Json(ChatResponse {
        conversation_id,
        content: response.content,
        finish_reason: response.finish_reason,
        tool_calls: response.tool_calls,
        status: "completed".to_owned(),
        pending_approval: None,
    }))
}
