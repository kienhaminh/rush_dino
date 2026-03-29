use axum::{extract::Path, extract::State, Json};
use serde::Serialize;

use rushdino_agent::InputRequest;
use rushdino_common::Result;

use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDetail {
    pub id: String,
    pub messages: Vec<rushdino_common::models::Message>,
    pub pending_input_requests: Vec<InputRequest>,
}

pub async fn list_conversations(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let items = engine.list_conversations().await?;
    Ok(Json(serde_json::json!({"items": items})))
}

pub async fn get_conversation(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<ConversationDetail>> {
    let engine = state.engine()?;
    let messages = engine.get_conversation_messages(&id).await?;
    let pending_input_requests = state.input_gate.list_pending_for_conversation(&id).await;
    Ok(Json(ConversationDetail {
        id,
        messages,
        pending_input_requests,
    }))
}

pub async fn delete_conversation(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    engine.delete_conversation(&id).await?;
    Ok(Json(serde_json::json!({"deleted": true})))
}
