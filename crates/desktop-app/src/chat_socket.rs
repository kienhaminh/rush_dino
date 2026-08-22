//! Chat WebSocket client: connects to `/api/ws/chat` and parses events.

use anyhow::{Context as _, Result};
use futures::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::{
    client::IntoClientRequest as _,
    http::HeaderValue,
    Message,
};

/// Events forwarded from the socket to the UI.
#[derive(Debug, Clone)]
pub enum ChatSocketEvent {
    Chunk { delta: String, conversation_id: Option<String> },
    Completed { content: Option<String>, conversation_id: Option<String> },
    Reset,
    Tool { name: String, completed: bool },
    Approval(crate::models::PendingApproval),
    ApprovalResolved { request_id: String },
    InputRequest(crate::models::InputRequest),
    Failure(String),
}

pub struct ChatSocket {
    pub sink: futures::channel::mpsc::UnboundedSender<Message>,
}

impl ChatSocket {
    /// Connect and start forwarding parsed events into `event_tx`.
    ///
    /// Returns a sink used to send messages / approval responses.
    #[allow(clippy::too_many_arguments)]
    pub async fn connect(
        api: &crate::api_client::ApiClient,
        event_tx: futures::channel::mpsc::UnboundedSender<ChatSocketEvent>,
    ) -> Result<Self> {
        let url = format!("{}/api/ws/chat", api.base_url().replacen("http", "ws", 1));
        let mut request = url
            .into_client_request()
            .context("invalid websocket URL")?;
        request.headers_mut().insert(
            "Authorization",
            HeaderValue::from_str(&api.ws_authorization("/api/ws/chat"))?,
        );

        let (ws, _) = tokio_tungstenite::connect_async(request).await?;
        let (mut sink, mut stream) = ws.split();

        // Outgoing messages from the app to the socket.
        let (outgoing_tx, mut outgoing_rx) = futures::channel::mpsc::unbounded::<Message>();
        tokio::spawn(async move {
            while let Some(msg) = outgoing_rx.next().await {
                if sink.send(msg).await.is_err() {
                    break;
                }
            }
        });

        // Incoming messages → typed events.
        tokio::spawn(async move {
            while let Some(Ok(msg)) = stream.next().await {
                match msg {
                    Message::Text(text) => {
                        if let Some(event) = parse_event(&text) {
                            if event_tx.unbounded_send(event).is_err() {
                                break;
                            }
                        }
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            let _ = event_tx.unbounded_send(ChatSocketEvent::Failure(
                "Chat connection closed".to_string(),
            ));
        });

        Ok(Self { sink: outgoing_tx })
    }

    /// Send a chat message over the socket.
    pub fn send_chat(
        &self,
        message: &str,
        conversation_id: Option<&str>,
        thinking_mode: &str,
    ) -> Result<()> {
        let payload = serde_json::json!({
            "message": message,
            "conversation_id": conversation_id,
            "profile_id": serde_json::Value::Null,
            "thinking_mode": thinking_mode,
        });
        self.sink
            .unbounded_send(Message::text(payload.to_string()))
            .context("socket closed")?;
        Ok(())
    }

    /// Respond to an approval request.
    pub fn send_approval(&self, request_id: &str, approved: bool) -> Result<()> {
        let payload = serde_json::json!({
            "type": "approval_response",
            "request_id": request_id,
            "approved": approved,
        });
        self.sink
            .unbounded_send(Message::text(payload.to_string()))
            .context("socket closed")?;
        Ok(())
    }
}

fn parse_event(text: &str) -> Option<ChatSocketEvent> {
    let payload: serde_json::Value = serde_json::from_str(text).ok()?;
    let kind = payload.get("type").and_then(|v| v.as_str())?;
    let conversation_id = payload
        .get("conversation_id")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    Some(match kind {
        "chat_chunk" => ChatSocketEvent::Chunk {
            delta: payload
                .get("delta")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            conversation_id,
        },
        "assistant_message" => ChatSocketEvent::Completed {
            content: payload
                .get("content")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            conversation_id,
        },
        "assistant_reset" | "session_reset" => ChatSocketEvent::Reset,
        "tool_start" => ChatSocketEvent::Tool {
            name: tool_name(&payload),
            completed: false,
        },
        "tool_end" => ChatSocketEvent::Tool {
            name: tool_name(&payload),
            completed: true,
        },
        "approval_request" => ChatSocketEvent::Approval(crate::models::PendingApproval {
            request_id: payload
                .get("request_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            tool: payload
                .get("tool")
                .and_then(|v| v.as_str())
                .unwrap_or("Tool")
                .to_string(),
            arguments: payload.get("args").cloned().unwrap_or(serde_json::Value::Null),
        }),
        "approval_result" => ChatSocketEvent::ApprovalResolved {
            request_id: payload
                .get("request_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        },
        "input_request" => {
            return serde_json::from_value::<crate::models::InputRequest>(payload)
                .map(ChatSocketEvent::InputRequest)
                .ok()
        }
        "error" => ChatSocketEvent::Failure(
            payload
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown server error")
                .to_string(),
        ),
        _ => return None,
    })
}

fn tool_name(payload: &serde_json::Value) -> String {
    payload
        .get("tool_name")
        .and_then(|v| v.as_str())
        .unwrap_or("Tool")
        .to_string()
}
