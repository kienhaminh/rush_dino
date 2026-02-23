use axum::{extract::Path, extract::State, Json};
use serde::Serialize;

use rushdino_common::Result;

use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct ConversationDetail {
    pub id: String,
    pub messages: Vec<rushdino_common::models::Message>,
}

pub async fn list_conversations(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    let items = state.engine.list_conversations().await?;
    Ok(Json(serde_json::json!({"items": items})))
}

pub async fn get_conversation(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<ConversationDetail>> {
    let messages = state.engine.get_conversation_messages(&id).await?;
    Ok(Json(ConversationDetail { id, messages }))
}

pub async fn delete_conversation(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    state.engine.delete_conversation(&id).await?;
    Ok(Json(serde_json::json!({"deleted": true})))
}
