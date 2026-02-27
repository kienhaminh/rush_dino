use async_trait::async_trait;
use tokio::sync::mpsc;

use rushdino_common::Result;
use rushdino_gateway::{ChannelAdapter, IncomingMessage, OutgoingMessage};

/// Slack channel adapter using Socket Mode (xapp token) for receiving
/// and the Slack Web API for sending.
///
/// Socket Mode requires:
/// - `slack_bot_token`  — xoxb-... (for posting messages)
/// - `slack_app_token`  — xapp-... (for Socket Mode WebSocket connection)
pub struct SlackAdapter {
    bot_token: String,
    app_token: String,
}

impl SlackAdapter {
    pub fn new(bot_token: impl Into<String>, app_token: impl Into<String>) -> Self {
        Self {
            bot_token: bot_token.into(),
            app_token: app_token.into(),
        }
    }

    /// Open a Slack Socket Mode WebSocket connection using the app token.
    /// Calls `apps.connections.open` to get the WSS URL, then reads events.
    async fn run_socket_mode(&self, tx: mpsc::Sender<IncomingMessage>) -> Result<()> {
        let client = reqwest::Client::new();

        // Request a Socket Mode WSS URL from Slack.
        let resp = client
            .post("https://slack.com/api/apps.connections.open")
            .bearer_auth(&self.app_token)
            .send()
            .await
            .map_err(|e| rushdino_common::AppError::Agent(format!("slack connect: {e}")))?
            .json::<serde_json::Value>()
            .await
            .map_err(|e| rushdino_common::AppError::Agent(format!("slack connect json: {e}")))?;

        if resp["ok"].as_bool() != Some(true) {
            return Err(rushdino_common::AppError::Agent(format!(
                "slack apps.connections.open failed: {}",
                resp["error"].as_str().unwrap_or("unknown")
            )));
        }

        let wss_url = resp["url"]
            .as_str()
            .ok_or_else(|| {
                rushdino_common::AppError::Agent("slack: missing wss url in response".to_owned())
            })?
            .to_owned();

        tracing::info!("Slack Socket Mode connected");

        // Connect to the WSS endpoint and forward events.
        self.handle_socket_events(wss_url, tx).await
    }

    /// Read Slack envelope events from the Socket Mode WebSocket.
    /// Acknowledges each envelope and extracts message events.
    async fn handle_socket_events(
        &self,
        wss_url: String,
        tx: mpsc::Sender<IncomingMessage>,
    ) -> Result<()> {
        use tokio_tungstenite::connect_async;
        use tokio_tungstenite::tungstenite::Message as WsMsg;
        use futures::{SinkExt, StreamExt};

        let (ws_stream, _) = connect_async(&wss_url)
            .await
            .map_err(|e| rushdino_common::AppError::Agent(format!("slack ws connect: {e}")))?;

        let (mut ws_sink, mut ws_recv) = ws_stream.split();

        while let Some(msg) = ws_recv.next().await {
            let msg = match msg {
                Ok(m) => m,
                Err(e) => {
                    tracing::warn!("slack ws recv error: {e}");
                    break;
                }
            };

            let WsMsg::Text(text) = msg else { continue };

            let Ok(envelope) = serde_json::from_str::<serde_json::Value>(&text) else {
                continue;
            };

            // Acknowledge the envelope so Slack knows we received it.
            if let Some(envelope_id) = envelope["envelope_id"].as_str() {
                let ack = serde_json::json!({"envelope_id": envelope_id}).to_string();
                let _ = ws_sink.send(WsMsg::Text(ack)).await;
            }

            // Extract message events from push payloads.
            if envelope["type"] == "events_api" {
                let event = &envelope["payload"]["event"];
                if event["type"] == "message"
                    && event["bot_id"].is_null()
                    && event["subtype"].is_null()
                {
                    let channel = event["channel"].as_str().unwrap_or("").to_owned();
                    let text = event["text"].as_str().unwrap_or("").to_owned();

                    if !channel.is_empty() && !text.is_empty() {
                        let incoming = IncomingMessage {
                            channel_id: "slack".to_owned(),
                            sender_id: channel,
                            text,
                            timestamp: chrono::Utc::now(),
                        };
                        let _ = tx.send(incoming).await;
                    }
                }
            }
        }

        Ok(())
    }
}

#[async_trait]
impl ChannelAdapter for SlackAdapter {
    fn channel_id(&self) -> &str {
        "slack"
    }

    async fn start(&self, tx: mpsc::Sender<IncomingMessage>) -> Result<()> {
        // Reconnect loop: restart Socket Mode if the WebSocket drops.
        loop {
            if let Err(err) = self.run_socket_mode(tx.clone()).await {
                tracing::error!("slack socket mode error: {err}");
            }
            tracing::info!("Slack Socket Mode reconnecting in 5s…");
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    }

    async fn send_message(&self, recipient: &str, msg: OutgoingMessage) -> Result<()> {
        let client = reqwest::Client::new();
        let body = serde_json::json!({
            "channel": recipient,
            "text": msg.text,
        });

        let resp = client
            .post("https://slack.com/api/chat.postMessage")
            .bearer_auth(&self.bot_token)
            .json(&body)
            .send()
            .await
            .map_err(|e| rushdino_common::AppError::Agent(format!("slack post: {e}")))?
            .json::<serde_json::Value>()
            .await
            .map_err(|e| rushdino_common::AppError::Agent(format!("slack post json: {e}")))?;

        if resp["ok"].as_bool() != Some(true) {
            return Err(rushdino_common::AppError::Agent(format!(
                "slack chat.postMessage failed: {}",
                resp["error"].as_str().unwrap_or("unknown")
            )));
        }

        Ok(())
    }
}
