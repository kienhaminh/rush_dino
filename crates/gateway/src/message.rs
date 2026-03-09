use chrono::{DateTime, Utc};

pub use rushdino_common::{
    LinkTarget as GatewayLinkTarget, RichContent as OutgoingMessage,
    RichContentBlock as OutgoingMessageBlock, TextFormat as RichTextFormat,
};

/// A message arriving from any channel into the gateway.
#[derive(Debug, Clone)]
pub struct IncomingMessage {
    /// Which channel this came from ("telegram", "discord", "slack", "webchat")
    pub channel_id: String,
    /// Gateway session routing identifier (chat_id, channel_id, socket_id)
    pub sender_id: String,
    /// Platform-specific actor identifier for access control decisions.
    pub actor_id: String,
    /// Optional human-readable actor label.
    pub actor_display: Option<String>,
    /// Platform-specific target to use for replies.
    pub reply_target: String,
    /// Whether this message came from a direct-message/private context.
    pub is_direct_message: bool,
    /// Whether the adapter wants the gateway to stream preview updates for this message.
    pub enable_streaming_preview: bool,
    /// Adapter-specific message identifier when the platform provides one.
    pub external_message_id: Option<String>,
    /// The text content of the message
    pub text: String,
    /// When the message arrived
    pub timestamp: DateTime<Utc>,
}
