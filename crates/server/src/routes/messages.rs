//! HTTP route for listing inter-agent messages.

use axum::{extract::Query, extract::State, Json};
use serde::{Deserialize, Serialize};

use rushdino_common::Result;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct MessagesQuery {
    pub agent: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub unread_only: bool,
}

fn default_limit() -> i64 {
    50
}

#[derive(Debug, Serialize)]
pub struct MessagesResponse {
    pub items: Vec<rushdino_agent::AgentMessage>,
}

/// GET /api/messages
///
/// Returns inter-agent messages. When `agent` query param is supplied, returns
/// only messages addressed to that agent (inbox). Otherwise returns all messages
/// ordered by created_at descending up to `limit` (default 50).
pub async fn list_messages(
    State(state): State<AppState>,
    Query(query): Query<MessagesQuery>,
) -> Result<Json<MessagesResponse>> {
    let engine = state.engine()?;
    let store = engine.message_store();
    let items = if let Some(ref agent) = query.agent {
        store.inbox(agent, query.unread_only).await?
    } else {
        store.list_all(query.limit).await?
    };
    Ok(Json(MessagesResponse { items }))
}
