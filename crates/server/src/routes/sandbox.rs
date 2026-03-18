// Sandbox API routes — policy read/write, network hot-reload, audit log, and
// approval/denial of pending egress requests.
//
// All handlers use `State<AppState>` and access `state.sandbox_registry` for
// the per-session EgressProxy and ApprovalGate maps.  Agent-scoped policy files
// are read/written under `state.config().data_dir / "agents" / {agent_id} /
// sandbox.yaml`.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use serde::Deserialize;

use rushdino_security::{
    audit_log::AuditLog,
    policy::types::{NetworkPolicy, SandboxPolicy},
};

use crate::state::AppState;

// ---------------------------------------------------------------------------
// GET /api/agents/{agent_id}/sandbox
// ---------------------------------------------------------------------------

/// Return the `sandbox.yaml` for the given agent, if one exists.
///
/// Responds with `404 Not Found` when no policy file is present.
pub async fn get_agent_sandbox(
    State(state): State<AppState>,
    Path(agent_id): Path<String>,
) -> Result<Json<SandboxPolicy>, StatusCode> {
    let agents_dir = state.config().data_dir.join("agents");
    match SandboxPolicy::load_for_agent(&agents_dir, &agent_id) {
        Ok(Some(policy)) => Ok(Json(policy)),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!(agent_id = %agent_id, error = %e, "failed to load sandbox policy");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

// ---------------------------------------------------------------------------
// PUT /api/agents/{agent_id}/sandbox
// ---------------------------------------------------------------------------

/// Write (or replace) the `sandbox.yaml` for the given agent.
///
/// Creates `<data_dir>/agents/<agent_id>/` if it does not exist.
pub async fn put_agent_sandbox(
    State(state): State<AppState>,
    Path(agent_id): Path<String>,
    Json(policy): Json<SandboxPolicy>,
) -> StatusCode {
    let agents_dir = state.config().data_dir.join("agents");
    let agent_dir = agents_dir.join(&agent_id);

    if let Err(e) = std::fs::create_dir_all(&agent_dir) {
        tracing::error!(agent_id = %agent_id, error = %e, "failed to create agent directory");
        return StatusCode::INTERNAL_SERVER_ERROR;
    }

    let content = match serde_yaml::to_string(&policy) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(agent_id = %agent_id, error = %e, "failed to serialize sandbox policy");
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
    };

    let path = agent_dir.join("sandbox.yaml");
    match std::fs::write(&path, content) {
        Ok(_) => StatusCode::OK,
        Err(e) => {
            tracing::error!(agent_id = %agent_id, error = %e, "failed to write sandbox policy");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

// ---------------------------------------------------------------------------
// PATCH /api/sessions/{session_id}/sandbox/network
// ---------------------------------------------------------------------------

/// Hot-reload the network policy for an active agent session.
///
/// Looks up the `EgressProxy` registered for the session and atomically
/// replaces its policy via `update_policy()`.  Returns `404` if no proxy is
/// registered for the session (i.e. the session is not running a sandboxed
/// agent).
pub async fn patch_session_network_policy(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(new_policy): Json<NetworkPolicy>,
) -> StatusCode {
    let proxies = state.sandbox_registry.proxies.read().await;
    if let Some(proxy) = proxies.get(&session_id) {
        proxy.update_policy(new_policy);
        StatusCode::OK
    } else {
        StatusCode::NOT_FOUND
    }
}

// ---------------------------------------------------------------------------
// GET /api/sessions/{session_id}/audit-log
// ---------------------------------------------------------------------------

/// Return up to 100 of the most recent sandbox audit-log entries for a session.
pub async fn get_session_audit_log(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Json<Vec<rushdino_security::audit_log::AuditEntry>>, StatusCode> {
    match AuditLog::query(&state.sandbox_registry.pool, &session_id, 100).await {
        Ok(entries) => Ok(Json(entries)),
        Err(e) => {
            tracing::error!(session_id = %session_id, error = %e, "failed to query audit log");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

// ---------------------------------------------------------------------------
// POST /api/sessions/{session_id}/sandbox/approve
// ---------------------------------------------------------------------------

/// Approve a pending egress request for the given session.
///
/// `request_id` must identify a request currently held in the session's
/// `ApprovalGate`.  Returns `404` if the session or request is not found.
pub async fn approve_session_request(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(body): Json<ApproveBody>,
) -> StatusCode {
    let gates = state.sandbox_registry.approval_gates.read().await;
    if let Some(gate) = gates.get(&session_id) {
        if gate.approve(&body.request_id).await {
            StatusCode::OK
        } else {
            StatusCode::NOT_FOUND
        }
    } else {
        StatusCode::NOT_FOUND
    }
}

// ---------------------------------------------------------------------------
// POST /api/sessions/{session_id}/sandbox/deny
// ---------------------------------------------------------------------------

/// Deny a pending egress request for the given session.
pub async fn deny_session_request(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(body): Json<ApproveBody>,
) -> StatusCode {
    let gates = state.sandbox_registry.approval_gates.read().await;
    if let Some(gate) = gates.get(&session_id) {
        if gate.deny(&body.request_id).await {
            StatusCode::OK
        } else {
            StatusCode::NOT_FOUND
        }
    } else {
        StatusCode::NOT_FOUND
    }
}

// ---------------------------------------------------------------------------
// Shared request body types
// ---------------------------------------------------------------------------

/// Request body shared by the approve and deny endpoints.
#[derive(Debug, Deserialize)]
pub struct ApproveBody {
    /// UUID of the pending approval request to resolve.
    pub request_id: String,
}
