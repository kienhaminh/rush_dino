use std::sync::{Arc, OnceLock};

use async_trait::async_trait;
use serenity::{
    builder::CreateMessage,
    model::{channel::Message, gateway::Ready, id::ChannelId},
    prelude::*,
};
use tokio::sync::mpsc;

use rushdino_common::Result;
use rushdino_gateway::{ChannelAdapter, IncomingMessage, OutgoingMessage};

/// Serenity EventHandler — forwards every non-bot message to the gateway router.
struct DiscordHandler {
    tx: mpsc::Sender<IncomingMessage>,
}

#[async_trait]
impl EventHandler for DiscordHandler {
    async fn message(&self, _ctx: Context, msg: Message) {
        if msg.author.bot {
            return;
        }
        let incoming = IncomingMessage {
            channel_id: "discord".to_owned(),
            // Use the channel_id as recipient so send_message can reply to the same channel.
            sender_id: msg.channel_id.get().to_string(),
            text: msg.content.clone(),
            timestamp: chrono::Utc::now(),
        };
        let _ = self.tx.send(incoming).await;
    }

    async fn ready(&self, _ctx: Context, ready: Ready) {
        tracing::info!("Discord connected as '{}'", ready.user.name);
    }
}

/// Discord channel adapter using serenity.
/// `sender_id` / `recipient` is the Discord channel_id (u64 as string).
pub struct DiscordAdapter {
    token: String,
    /// Shared Http handle populated once the serenity Client is built in `start()`.
    http: Arc<OnceLock<Arc<serenity::http::Http>>>,
}

impl DiscordAdapter {
    pub fn new(token: impl Into<String>) -> Self {
        Self {
            token: token.into(),
            http: Arc::new(OnceLock::new()),
        }
    }
}

#[async_trait]
impl ChannelAdapter for DiscordAdapter {
    fn channel_id(&self) -> &str {
        "discord"
    }

    async fn start(&self, tx: mpsc::Sender<IncomingMessage>) -> Result<()> {
        // Privileged intent MESSAGE_CONTENT must be enabled in the Discord dev portal.
        let intents = GatewayIntents::GUILD_MESSAGES
            | GatewayIntents::DIRECT_MESSAGES
            | GatewayIntents::MESSAGE_CONTENT;

        let mut client = Client::builder(&self.token, intents)
            .event_handler(DiscordHandler { tx })
            .await
            .map_err(|e| rushdino_common::AppError::Agent(format!("discord client build: {e}")))?;

        // Capture Http so send_message can use it without re-building.
        self.http.set(client.http.clone()).ok();

        client
            .start()
            .await
            .map_err(|e| rushdino_common::AppError::Agent(format!("discord run: {e}")))
    }

    async fn send_message(&self, recipient: &str, msg: OutgoingMessage) -> Result<()> {
        let http = self.http.get().ok_or_else(|| {
            rushdino_common::AppError::Agent(
                "discord adapter not started yet — Http unavailable".to_owned(),
            )
        })?;

        let channel_id_u64: u64 = recipient.parse().map_err(|e| {
            rushdino_common::AppError::Agent(format!(
                "invalid discord channel id '{recipient}': {e}"
            ))
        })?;

        ChannelId::new(channel_id_u64)
            .send_message(http.as_ref(), CreateMessage::new().content(&msg.text))
            .await
            .map_err(|e| rushdino_common::AppError::Agent(format!("discord send: {e}")))?;

        Ok(())
    }
}
