use async_trait::async_trait;
use tokio::sync::mpsc;

use rushdino_common::Result;

use crate::message::{IncomingMessage, OutgoingMessage};

/// Every messaging platform must implement this trait.
/// `start()` launches the platform listener (blocking until stopped).
/// `send_message()` delivers a response back to the original sender.
#[async_trait]
pub trait ChannelAdapter: Send + Sync + 'static {
    /// Unique identifier for this channel, e.g. "telegram", "discord".
    fn channel_id(&self) -> &str;

    /// Begin listening for incoming messages and push them onto `tx`.
    /// Called inside a dedicated tokio task — may block until the adapter stops.
    async fn start(&self, tx: mpsc::Sender<IncomingMessage>) -> Result<()>;

    /// Deliver a response to `recipient` (platform-specific id) on this channel.
    async fn send_message(&self, recipient: &str, msg: OutgoingMessage) -> Result<()>;
}
