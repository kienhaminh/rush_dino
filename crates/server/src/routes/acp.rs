use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

use rushdino_common::{AppError, Result};

use crate::state::AppState;

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

fn require_acp_manager(
    state: &AppState,
) -> Result<&std::sync::Arc<rushdino_acp::CodingAgentManager>> {
    state
        .acp_manager
        .as_ref()
        .ok_or_else(|| AppError::Validation("ACP is not enabled".to_owned()))
}

// -------------------------------------------------------------------------
// Agent management
// -------------------------------------------------------------------------

/// GET /api/acp/agents — list all known coding agents with install status.
pub async fn list_agents(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    let mgr = require_acp_manager(&state)?;
    let agents = mgr.detect_installed();
    Ok(Json(serde_json::json!({ "agents": agents })))
}

/// POST /api/acp/agents/:id/install — install a coding agent, streamed via broadcast.
pub async fn install_agent(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let mgr = require_acp_manager(&state)?;
    // Run install in background; progress events flow through the broadcast hub.
    let mgr = mgr.clone();
    tokio::spawn(async move {
        if let Err(e) = mgr.install_agent(&id).await {
            tracing::warn!("acp install_agent({id}) failed: {e}");
        }
    });
    Ok(Json(serde_json::json!({ "status": "installing" })))
}

// -------------------------------------------------------------------------
// Session management
// -------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct CreateSessionInput {
    pub agent_id: String,
    pub conversation_id: String,
    pub working_dir: Option<String>,
}

/// GET /api/acp/sessions — list recent sessions.
pub async fn list_sessions(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    let mgr = require_acp_manager(&state)?;
    let sessions = mgr.list_sessions().await?;
    Ok(Json(serde_json::json!({ "sessions": sessions })))
}

/// POST /api/acp/sessions — create and spawn a new ACP session.
pub async fn create_session(
    State(state): State<AppState>,
    Json(payload): Json<CreateSessionInput>,
) -> Result<Json<serde_json::Value>> {
    let mgr = require_acp_manager(&state)?;
    let working_dir = payload.working_dir.map(std::path::PathBuf::from);
    let session = mgr
        .spawn_session(&payload.agent_id, &payload.conversation_id, working_dir)
        .await?;
    Ok(Json(serde_json::json!({ "session": session })))
}

/// GET /api/acp/sessions/:id — fetch a single session.
pub async fn get_session(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let mgr = require_acp_manager(&state)?;
    let session = mgr.get_session(&id).await?;
    Ok(Json(serde_json::json!({ "session": session })))
}

// -------------------------------------------------------------------------
// Prompt
// -------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct SendPromptInput {
    pub text: String,
    #[serde(default = "default_true")]
    pub stream: bool,
}

fn default_true() -> bool {
    true
}

/// POST /api/acp/sessions/:id/prompt — send a prompt to an active session.
pub async fn send_prompt(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<SendPromptInput>,
) -> Result<Json<serde_json::Value>> {
    let mgr = require_acp_manager(&state)?;
    let final_text = mgr.send_prompt(&id, &payload.text, payload.stream).await?;
    Ok(Json(serde_json::json!({ "result": final_text })))
}

// -------------------------------------------------------------------------
// Session lifecycle
// -------------------------------------------------------------------------

/// POST /api/acp/sessions/:id/cancel — mark session as cancelled.
pub async fn cancel_session(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let mgr = require_acp_manager(&state)?;
    mgr.cancel_session(&id).await?;
    Ok(Json(serde_json::json!({ "cancelled": true })))
}

/// DELETE /api/acp/sessions/:id — terminate and delete a session.
pub async fn terminate_session(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let mgr = require_acp_manager(&state)?;
    mgr.terminate_session(&id).await?;
    Ok(Json(serde_json::json!({ "terminated": true })))
}
