use axum::{
    extract::{ws::Message, State, WebSocketUpgrade},
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;
use uuid::Uuid;

use rushdino_agent::engine::WsStreamEvent;

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
    let session_id = Uuid::new_v4().to_string();
    let mut approval_rx = state.gate.register_session(&session_id).await;
    let mut broadcast_rx = state.chat_broadcast.subscribe();
    let (mut ws_sink, mut ws_recv) = socket.split();

    let (outbound_tx, mut outbound_rx) = mpsc::channel::<serde_json::Value>(256);

    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                outbound = outbound_rx.recv() => {
                    let Some(payload) = outbound else { break };
                    if ws_sink.send(Message::Text(payload.to_string())).await.is_err() {
                        break;
                    }
                }
                approval = approval_rx.recv() => {
                    let Some(request) = approval else { break };
                    let payload = serde_json::json!({
                        "type": "approval_request",
                        "request_id": request.request_id,
                        "run_id": request.run_id,
                        "conversation_id": request.conversation_id,
                        "tool": request.tool,
                        "args": request.args,
                    });
                    if ws_sink.send(Message::Text(payload.to_string())).await.is_err() {
                        break;
                    }
                }
                broadcast = broadcast_rx.recv() => {
                    let Ok(payload) = broadcast else {
                        continue;
                    };
                    if ws_sink.send(Message::Text(payload.to_string())).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    let runtime = state.runtime.clone();
    let gate = state.gate.clone();
    let runtime_logs = state.runtime_logs.clone();
    let session_id_clone = session_id.clone();
    let mut recv_task = tokio::spawn(async move {
        let mut active_conversation: Option<String> = None;

        while let Some(Ok(message)) = ws_recv.next().await {
            let Message::Text(text) = message else {
                continue;
            };

            if let Some((request_id, approved)) = parse_approval_response(&text) {
                match gate.resolve(&session_id_clone, &request_id, approved).await {
                    Ok(request) => {
                        let _ = runtime_logs
                            .insert(
                                "info",
                                "approval",
                                "approval decision recorded",
                                Some(serde_json::json!({
                                    "requestId": request_id,
                                    "runId": request.run_id,
                                    "sessionId": session_id_clone,
                                    "tool": request.tool,
                                    "status": if approved { "approved" } else { "denied" },
                                })),
                            )
                            .await;
                        let _ = outbound_tx
                            .send(serde_json::json!({
                                "type": "approval_result",
                                "request_id": request.request_id,
                                "run_id": request.run_id,
                                "approved": approved,
                            }))
                            .await;
                    }
                    Err(err) => {
                        let _ = outbound_tx
                            .send(serde_json::json!({
                                "type": "approval_result",
                                "request_id": request_id,
                                "approved": approved,
                                "error": err.to_string(),
                            }))
                            .await;
                    }
                }
                continue;
            }

            let (conversation_id, user_text) = parse_chat_payload(&text, &active_conversation);
            let Some(user_text) = user_text else {
                continue;
            };
            let conversation_id = conversation_id.unwrap_or_else(|| Uuid::new_v4().to_string());

            let (event_tx, mut event_rx) = mpsc::channel::<WsStreamEvent>(128);
            let outbound_tx_clone = outbound_tx.clone();
            tokio::spawn(async move {
                while let Some(event) = event_rx.recv().await {
                    match event {
                        WsStreamEvent::ChatChunk {
                            run_id,
                            conversation_id,
                            chunk,
                        } => {
                            let _ = outbound_tx_clone
                                .send(serde_json::json!({
                                    "type": "chat_chunk",
                                    "run_id": run_id,
                                    "conversation_id": conversation_id,
                                    "delta": chunk.delta,
                                    "tool_calls": chunk.tool_calls,
                                    "done": chunk.done,
                                    "thinking_delta": chunk.thinking_delta,
                                }))
                                .await;
                        }
                        WsStreamEvent::AssistantReset {
                            run_id,
                            conversation_id,
                        } => {
                            let _ = outbound_tx_clone
                                .send(serde_json::json!({
                                    "type": "assistant_reset",
                                    "run_id": run_id,
                                    "conversation_id": conversation_id,
                                }))
                                .await;
                        }
                        WsStreamEvent::ToolStart {
                            run_id,
                            conversation_id,
                            tool_name,
                            args,
                        } => {
                            let _ = outbound_tx_clone
                                .send(serde_json::json!({
                                    "type": "tool_start",
                                    "run_id": run_id,
                                    "conversation_id": conversation_id,
                                    "tool_name": tool_name,
                                    "args": args,
                                }))
                                .await;
                        }
                        WsStreamEvent::ToolEnd {
                            run_id,
                            conversation_id,
                            tool_name,
                            result,
                            is_error,
                        } => {
                            let _ = outbound_tx_clone
                                .send(serde_json::json!({
                                    "type": "tool_end",
                                    "run_id": run_id,
                                    "conversation_id": conversation_id,
                                    "tool_name": tool_name,
                                    "result": result,
                                    "is_error": is_error,
                                }))
                                .await;
                        }
                        WsStreamEvent::AssistantMessage {
                            run_id,
                            conversation_id,
                            content,
                            rich_content,
                        } => {
                            let _ = outbound_tx_clone
                                .send(serde_json::json!({
                                    "type": "assistant_message",
                                    "run_id": run_id,
                                    "conversation_id": conversation_id,
                                    "content": content,
                                    "rich_content": rich_content,
                                }))
                                .await;
                        }
                        WsStreamEvent::Error {
                            run_id,
                            conversation_id,
                            message,
                        } => {
                            let _ = outbound_tx_clone
                                .send(serde_json::json!({
                                    "type": "error",
                                    "run_id": run_id,
                                    "conversation_id": conversation_id,
                                    "message": message,
                                }))
                                .await;
                        }
                    }
                }
            });

            let engine = match runtime.engine() {
                Ok(engine) => engine,
                Err(err) => {
                    let _ = outbound_tx
                        .send(serde_json::json!({
                            "type": "error",
                            "message": err.to_string(),
                        }))
                        .await;
                    continue;
                }
            };

            match engine
                .submit_ws_run(
                    &session_id_clone,
                    Some(conversation_id.clone()),
                    &user_text,
                    event_tx,
                )
                .await
            {
                Ok(run) => {
                    active_conversation = run.conversation_id.or(Some(conversation_id));
                }
                Err(err) => {
                    let _ = outbound_tx
                        .send(serde_json::json!({
                            "type": "error",
                            "message": err.to_string(),
                        }))
                        .await;
                    let _ = outbound_tx
                        .send(serde_json::json!({
                            "type": "chat_chunk",
                            "conversation_id": conversation_id,
                            "delta": format!("Error: {err}"),
                            "tool_calls": [],
                            "done": true,
                        }))
                        .await;
                }
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    state.gate.unregister_session(&session_id).await;
}

fn parse_approval_response(text: &str) -> Option<(String, bool)> {
    let payload: serde_json::Value = serde_json::from_str(text).ok()?;
    if payload.get("type").and_then(|v| v.as_str()) != Some("approval_response") {
        return None;
    }
    let request_id = payload.get("request_id").and_then(|v| v.as_str())?;
    let approved = payload.get("approved").and_then(|v| v.as_bool())?;
    Some((request_id.to_owned(), approved))
}

fn parse_chat_payload(
    text: &str,
    active_conversation: &Option<String>,
) -> (Option<String>, Option<String>) {
    if let Ok(request) = serde_json::from_str::<WsChatRequest>(text) {
        return (
            request
                .conversation_id
                .or_else(|| active_conversation.clone()),
            Some(request.message),
        );
    }
    (active_conversation.clone(), Some(text.to_owned()))
}
