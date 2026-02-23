use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use rushdino_common::Result;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub conversation_id: Option<String>,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub conversation_id: String,
    pub content: String,
    pub finish_reason: String,
    pub tool_calls: Vec<rushdino_common::models::ToolCall>,
}

pub async fn chat(
    State(state): State<AppState>,
    Json(request): Json<ChatRequest>,
) -> Result<Json<ChatResponse>> {
    let (conversation_id, response) = state
        .engine
        .chat_or_create(request.conversation_id, &request.message)
        .await?;

    Ok(Json(ChatResponse {
        conversation_id,
        content: response.content,
        finish_reason: response.finish_reason,
        tool_calls: response.tool_calls,
    }))
}
