use async_trait::async_trait;
use tokio::sync::{mpsc, watch};

use rushdino_common::Result;

use crate::{
    message::{IncomingMessage, OutgoingMessage},
    state::{AdapterLifecycleHandle, GatewayAdapterCapabilities},
};

#[derive(Clone)]
pub struct AdapterContext {
    pub inbound_tx: mpsc::Sender<IncomingMessage>,
    pub lifecycle: AdapterLifecycleHandle,
    pub shutdown_rx: watch::Receiver<bool>,
}

#[derive(Debug, Clone, Default)]
pub struct DeliveryPreview {
    pub fallback_reason: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct DeliveryOutcome {
    pub fallback_reason: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct PreviewUpdateOutcome {
    pub started: bool,
    pub fallback_reason: Option<String>,
}

/// Every messaging platform must implement this trait.
/// `start()` launches the platform listener (blocking until stopped).
/// `send_message()` delivers a response back to the original sender.
#[async_trait]
pub trait ChannelAdapter: Send + Sync + 'static {
    /// Unique identifier for this channel, e.g. "telegram", "discord".
    fn channel_id(&self) -> &str;

    /// Portable rich-message capabilities for this channel adapter.
    fn capabilities(&self) -> GatewayAdapterCapabilities {
        GatewayAdapterCapabilities::plain_text_only()
    }

    /// Begin listening for incoming messages and push them onto `tx`.
    /// Called inside a dedicated tokio task — may block until the adapter stops.
    async fn start(&self, context: AdapterContext) -> Result<()>;

    /// Preview whether this payload will degrade before any platform API call happens.
    fn preview_delivery(&self, _msg: &OutgoingMessage) -> DeliveryPreview {
        DeliveryPreview::default()
    }

    /// Deliver a response to `recipient` (platform-specific id) on this channel.
    async fn send_message(&self, recipient: &str, msg: OutgoingMessage) -> Result<()>;

    /// Deliver and optionally report that a native attempt degraded successfully.
    async fn send_message_with_outcome(
        &self,
        recipient: &str,
        msg: OutgoingMessage,
    ) -> Result<DeliveryOutcome> {
        self.send_message(recipient, msg).await?;
        Ok(DeliveryOutcome::default())
    }

    /// Update the preview state for a still-running assistant response.
    async fn update_preview(
        &self,
        _run_id: &str,
        _recipient: &str,
        _text: &str,
    ) -> Result<PreviewUpdateOutcome> {
        Ok(PreviewUpdateOutcome::default())
    }

    /// Materialize the preview into the permanent channel message(s).
    async fn finalize_preview(&self, _run_id: &str, _recipient: &str) -> Result<()> {
        Ok(())
    }

    /// Clear any pending preview before sending a non-preview final response.
    async fn clear_preview(&self, _run_id: &str, _recipient: &str) -> Result<()> {
        Ok(())
    }
}
