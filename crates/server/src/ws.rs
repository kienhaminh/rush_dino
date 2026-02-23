use axum::{
    extract::{ws::Message, State, WebSocketUpgrade},
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
struct WsChatRequest {
    conversation_id: Option<String>,
    message: String,
}

pub async fn ws_chat(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: axum::extract::ws::WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();

    while let Some(Ok(message)) = receiver.next().await {
        let Message::Text(text) = message else {
            continue;
        };

        let Ok(req) = serde_json::from_str::<WsChatRequest>(&text) else {
            let _ = sender
                .send(Message::Text(
                    serde_json::json!({"error":"invalid request"}).to_string(),
                ))
                .await;
            continue;
        };

        let Ok((conversation_id, mut stream)) = state
            .engine
            .stream_chat(req.conversation_id, &req.message)
            .await
        else {
            let _ = sender
                .send(Message::Text(
                    serde_json::json!({"error":"chat failed"}).to_string(),
                ))
                .await;
            continue;
        };

        while let Some(chunk) = stream.recv().await {
            let payload = serde_json::json!({
                "conversation_id": conversation_id,
                "delta": chunk.delta,
                "tool_calls": chunk.tool_calls,
                "done": chunk.done,
            });
            if sender.send(Message::Text(payload.to_string())).await.is_err() {
                return;
            }
        }
    }
}
