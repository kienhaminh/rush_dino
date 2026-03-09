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
    Ok(Json(ConversationDetail { id, messages }))
}

pub async fn delete_conversation(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    engine.delete_conversation(&id).await?;
    Ok(Json(serde_json::json!({"deleted": true})))
}
