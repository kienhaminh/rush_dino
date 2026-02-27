use chrono::{DateTime, Utc};

/// A message arriving from any channel into the gateway.
#[derive(Debug, Clone)]
pub struct IncomingMessage {
    /// Which channel this came from ("telegram", "discord", "slack", "webchat")
    pub channel_id: String,
    /// Platform-specific sender identifier (chat_id, user_id, socket_id)
    pub sender_id: String,
    /// The text content of the message
    pub text: String,
    /// When the message arrived
    pub timestamp: DateTime<Utc>,
}

/// A response to be delivered back through a channel.
#[derive(Debug, Clone)]
pub struct OutgoingMessage {
    pub text: String,
}
