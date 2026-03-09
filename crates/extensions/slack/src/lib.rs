mod rich_delivery;

use async_trait::async_trait;
use tokio::sync::mpsc;

use rushdino_common::Result;
use rushdino_gateway::{
    rich_message::render_markdown_fallback_message, AdapterContext, ChannelAdapter,
    DeliveryOutcome, DeliveryPreview, GatewayAdapterCapabilities, GatewayRichDeliveryMode,
    IncomingMessage, OutgoingMessage,
};

use crate::rich_delivery::{plan_delivery, SlackDeliveryPlan};

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
    async fn run_socket_mode(&self, context: &AdapterContext) -> Result<()> {
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
        context.lifecycle.connected().await;

        // Connect to the WSS endpoint and forward events.
        self.handle_socket_events(wss_url, context.inbound_tx.clone())
            .await
    }

    /// Read Slack envelope events from the Socket Mode WebSocket.
    /// Acknowledges each envelope and extracts message events.
    async fn handle_socket_events(
        &self,
        wss_url: String,
        tx: mpsc::Sender<IncomingMessage>,
    ) -> Result<()> {
        use futures::{SinkExt, StreamExt};
        use tokio_tungstenite::connect_async;
        use tokio_tungstenite::tungstenite::Message as WsMsg;

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
                    let actor_id = event["user"].as_str().unwrap_or("").to_owned();
                    let text = event["text"].as_str().unwrap_or("").to_owned();

                    if !channel.is_empty() && !text.is_empty() {
                        let incoming = IncomingMessage {
                            channel_id: "slack".to_owned(),
                            sender_id: channel.clone(),
                            actor_id,
                            actor_display: None,
                            reply_target: channel.clone(),
                            is_direct_message: channel.starts_with('D'),
                            enable_streaming_preview: false,
                            external_message_id: event["client_msg_id"]
                                .as_str()
                                .or_else(|| event["ts"].as_str())
                                .map(ToOwned::to_owned),
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

    fn capabilities(&self) -> GatewayAdapterCapabilities {
        GatewayAdapterCapabilities {
            plain_text: true,
            markdown: true,
            code_blocks: true,
            images: GatewayRichDeliveryMode::Native,
            link_buttons: GatewayRichDeliveryMode::Native,
        }
    }

    async fn start(&self, context: AdapterContext) -> Result<()> {
        // Reconnect loop: restart Socket Mode if the WebSocket drops.
        loop {
            if let Err(err) = self.run_socket_mode(&context).await {
                context.lifecycle.degraded(err.to_string()).await;
                tracing::error!("slack socket mode error: {err}");
            }
            context.lifecycle.note_reconnect().await;
            tracing::info!("Slack Socket Mode reconnecting in 5s…");
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    }

    fn preview_delivery(&self, msg: &OutgoingMessage) -> DeliveryPreview {
        match plan_delivery(msg, &self.capabilities()) {
            SlackDeliveryPlan::Degraded { reason, .. } => DeliveryPreview {
                fallback_reason: Some(reason),
            },
            _ => DeliveryPreview::default(),
        }
    }

    async fn send_message(&self, recipient: &str, msg: OutgoingMessage) -> Result<()> {
        self.send_message_with_outcome(recipient, msg).await?;
        Ok(())
    }

    async fn send_message_with_outcome(
        &self,
        recipient: &str,
        msg: OutgoingMessage,
    ) -> Result<DeliveryOutcome> {
        let client = reqwest::Client::new();

        match plan_delivery(&msg, &self.capabilities()) {
            SlackDeliveryPlan::TextOnly { text } => {
                post_message(&client, &self.bot_token, slack_text_body(recipient, &text)).await?;
                Ok(DeliveryOutcome::default())
            }
            SlackDeliveryPlan::Degraded { text, reason } => {
                post_message(&client, &self.bot_token, slack_text_body(recipient, &text)).await?;
                Ok(DeliveryOutcome {
                    fallback_reason: Some(reason),
                })
            }
            SlackDeliveryPlan::Native { text, blocks } => {
                let native_body = serde_json::json!({
                    "channel": recipient,
                    "text": text,
                    "blocks": blocks,
                });
                if let Err(err) = post_message(&client, &self.bot_token, native_body).await {
                    let degraded = render_markdown_fallback_message(&msg, &self.capabilities());
                    post_message(
                        &client,
                        &self.bot_token,
                        slack_text_body(recipient, &degraded),
                    )
                    .await?;
                    return Ok(DeliveryOutcome {
                        fallback_reason: Some(format!(
                            "slack native delivery degraded after API rejection: {err}"
                        )),
                    });
                }

                Ok(DeliveryOutcome::default())
            }
        }
    }
}

fn slack_text_body(recipient: &str, text: &str) -> serde_json::Value {
    serde_json::json!({
        "channel": recipient,
        "text": text,
    })
}

async fn post_message(
    client: &reqwest::Client,
    bot_token: &str,
    body: serde_json::Value,
) -> Result<()> {
    let resp = client
        .post("https://slack.com/api/chat.postMessage")
        .bearer_auth(bot_token)
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
