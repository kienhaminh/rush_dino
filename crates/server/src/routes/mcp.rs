//! MCP server status routes.
//!
//! GET /api/mcp/status — return live connection status for all configured MCP servers.

use axum::{extract::State, Json};
use serde_json::Value;

use crate::state::AppState;

/// GET /api/mcp/status
///
/// Returns a snapshot of connection status for all configured MCP servers,
/// including their tool counts and last-seen timestamps.
pub async fn get_mcp_status(State(state): State<AppState>) -> Json<Value> {
    let statuses = state.mcp_manager.status_snapshot();
    Json(serde_json::to_value(statuses).unwrap_or_default())
}
