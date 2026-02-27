use axum::{
    extract::{ws::Message, State, WebSocketUpgrade},
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use uuid::Uuid;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
struct WsChatRequest {
    #[allow(dead_code)]
    conversation_id: Option<String>,
    message: String,
}

pub async fn ws_chat(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: axum::extract::ws::WebSocket, state: AppState) {
    let client_id = Uuid::new_v4().to_string();
    let mut response_rx = state.webchat.connect(client_id.clone()).await;

    let (mut ws_sink, mut ws_recv) = socket.split();

    // Forward responses from the gateway back to the WebSocket client.
    let mut send_task = tokio::spawn(async move {
        while let Some(text) = response_rx.recv().await {
            // Emit a streaming-compatible payload so the frontend can handle it.
            let payload = serde_json::json!({
                "delta": text,
                "done": true,
            });
            if ws_sink
                .send(Message::Text(payload.to_string()))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    // Read messages from the WebSocket client and push them into the gateway.
    let webchat = state.webchat.clone();
    let cid = client_id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(message)) = ws_recv.next().await {
            let Message::Text(text) = message else {
                continue;
            };

            // Accept both plain text and the structured JSON format.
            let user_text = if let Ok(req) = serde_json::from_str::<WsChatRequest>(&text) {
                req.message
            } else {
                text.to_string()
            };

            webchat.handle_incoming(cid.clone(), user_text).await;
        }
    });

    // Cancel both tasks as soon as either side closes.
    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    state.webchat.disconnect(&client_id).await;
}
