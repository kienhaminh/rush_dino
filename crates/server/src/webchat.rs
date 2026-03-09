use std::{collections::HashMap, sync::Arc};

use async_trait::async_trait;
use tokio::sync::{mpsc, Mutex};

use rushdino_common::Result;
use rushdino_gateway::{
    rich_message::render_markdown_message, AdapterContext, ChannelAdapter,
    GatewayAdapterCapabilities, GatewayRichDeliveryMode, IncomingMessage, OutgoingMessage,
};

/// Per-client response sender: router calls send_message → client WebSocket receives it.
type ResponseTx = mpsc::UnboundedSender<String>;

/// WebSocket channel adapter.
/// WebSocket connections are driven by axum; this adapter bridges them into
/// the gateway's IncomingMessage stream and routes responses back.
#[derive(Clone)]
pub struct WebChatAdapter {
    /// Active client connections keyed by ephemeral client_id.
    response_channels: Arc<Mutex<HashMap<String, ResponseTx>>>,
    /// Gateway channel populated by `start()` so incoming messages can be forwarded.
    gateway_tx: Arc<std::sync::OnceLock<mpsc::Sender<IncomingMessage>>>,
}

impl WebChatAdapter {
    pub fn new() -> Self {
        Self {
            response_channels: Arc::new(Mutex::new(HashMap::new())),
            gateway_tx: Arc::new(std::sync::OnceLock::new()),
        }
    }

    /// Called by the WebSocket handler when a client connects.
    /// Returns a receiver the handler can poll for outgoing responses.
    pub async fn connect(&self, client_id: String) -> mpsc::UnboundedReceiver<String> {
        let (tx, rx) = mpsc::unbounded_channel();
        self.response_channels.lock().await.insert(client_id, tx);
        rx
    }

    /// Called by the WebSocket handler when a client disconnects.
    pub async fn disconnect(&self, client_id: &str) {
        self.response_channels.lock().await.remove(client_id);
    }

    /// Called by the WebSocket handler for each message received from the client.
    /// Pushes the message into the gateway router pipeline.
    pub async fn handle_incoming(&self, client_id: String, text: String) {
        if let Some(tx) = self.gateway_tx.get() {
            let incoming = IncomingMessage {
                channel_id: "webchat".to_owned(),
                sender_id: client_id.clone(),
                actor_id: client_id.clone(),
                actor_display: None,
                reply_target: client_id,
                is_direct_message: true,
                enable_streaming_preview: false,
                external_message_id: None,
                text,
                timestamp: chrono::Utc::now(),
            };
            let _ = tx.send(incoming).await;
        }
    }
}

impl Default for WebChatAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ChannelAdapter for WebChatAdapter {
    fn channel_id(&self) -> &str {
        "webchat"
    }

    fn capabilities(&self) -> GatewayAdapterCapabilities {
        GatewayAdapterCapabilities {
            plain_text: true,
            markdown: true,
            code_blocks: true,
            images: GatewayRichDeliveryMode::Degraded,
            link_buttons: GatewayRichDeliveryMode::Degraded,
        }
    }

    /// Stores the gateway tx so `handle_incoming` can forward messages, then returns.
    /// WebSocket connections are driven by axum — there is nothing to listen for here.
    ///
    /// Note: the `tx` moved into `gateway_tx` keeps the router channel open until
    /// `WebChatAdapter` itself is dropped (when `AppState` is dropped on shutdown).
    async fn start(&self, context: AdapterContext) -> Result<()> {
        self.gateway_tx.set(context.inbound_tx).ok();
        context.lifecycle.connected().await;
        let mut shutdown_rx = context.shutdown_rx.clone();
        if *shutdown_rx.borrow() {
            return Ok(());
        }
        let _ = shutdown_rx.changed().await;
        Ok(())
    }

    /// Delivers a response to the WebSocket client identified by `recipient`.
    async fn send_message(&self, recipient: &str, msg: OutgoingMessage) -> Result<()> {
        let channels = self.response_channels.lock().await;
        if let Some(tx) = channels.get(recipient) {
            let _ = tx.send(render_markdown_message(&msg, &self.capabilities()));
        }
        Ok(())
    }
}
