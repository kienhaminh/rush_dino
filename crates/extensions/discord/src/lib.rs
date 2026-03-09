mod rich_delivery;

use std::sync::Arc;

use async_trait::async_trait;
use serenity::{
    builder::{CreateActionRow, CreateButton, CreateEmbed, CreateMessage},
    model::{channel::Message, gateway::Ready, id::ChannelId},
    prelude::*,
};
use tokio::sync::{mpsc, RwLock};

use rushdino_common::Result;
use rushdino_gateway::{
    rich_message::render_markdown_fallback_message, AdapterContext, AdapterLifecycleHandle,
    ChannelAdapter, DeliveryOutcome, DeliveryPreview, GatewayAdapterCapabilities,
    GatewayRichDeliveryMode, IncomingMessage, OutgoingMessage,
};

use crate::rich_delivery::{plan_delivery, DiscordDeliveryPlan};

/// Serenity EventHandler — forwards every non-bot message to the gateway router.
struct DiscordHandler {
    tx: mpsc::Sender<IncomingMessage>,
    lifecycle: AdapterLifecycleHandle,
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
            actor_id: msg.author.id.get().to_string(),
            actor_display: msg
                .author
                .global_name
                .clone()
                .or_else(|| Some(msg.author.name.clone())),
            reply_target: msg.channel_id.get().to_string(),
            is_direct_message: msg.guild_id.is_none(),
            enable_streaming_preview: false,
            external_message_id: Some(msg.id.get().to_string()),
            text: msg.content.clone(),
            timestamp: chrono::Utc::now(),
        };
        let _ = self.tx.send(incoming).await;
    }

    async fn ready(&self, _ctx: Context, ready: Ready) {
        self.lifecycle.connected().await;
        tracing::info!("Discord connected as '{}'", ready.user.name);
    }
}

/// Discord channel adapter using serenity.
/// `sender_id` / `recipient` is the Discord channel_id (u64 as string).
pub struct DiscordAdapter {
    token: String,
    /// Shared Http handle updated whenever the serenity client restarts.
    http: Arc<RwLock<Option<Arc<serenity::http::Http>>>>,
}

impl DiscordAdapter {
    pub fn new(token: impl Into<String>) -> Self {
        Self {
            token: token.into(),
            http: Arc::new(RwLock::new(None)),
        }
    }
}

#[async_trait]
impl ChannelAdapter for DiscordAdapter {
    fn channel_id(&self) -> &str {
        "discord"
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
        // Privileged intent MESSAGE_CONTENT must be enabled in the Discord dev portal.
        let intents = GatewayIntents::GUILD_MESSAGES
            | GatewayIntents::DIRECT_MESSAGES
            | GatewayIntents::MESSAGE_CONTENT;

        let mut client = Client::builder(&self.token, intents)
            .event_handler(DiscordHandler {
                tx: context.inbound_tx,
                lifecycle: context.lifecycle.clone(),
            })
            .await
            .map_err(|e| rushdino_common::AppError::Agent(format!("discord client build: {e}")))?;

        // Capture Http so send_message can use it without re-building.
        *self.http.write().await = Some(client.http.clone());

        client
            .start()
            .await
            .map_err(|e| rushdino_common::AppError::Agent(format!("discord run: {e}")))
    }

    fn preview_delivery(&self, msg: &OutgoingMessage) -> DeliveryPreview {
        match plan_delivery(msg, &self.capabilities()) {
            DiscordDeliveryPlan::Degraded { reason, .. } => DeliveryPreview {
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
        let http = self.http.read().await.clone().ok_or_else(|| {
            rushdino_common::AppError::Agent(
                "discord adapter not started yet — Http unavailable".to_owned(),
            )
        })?;

        let channel_id_u64: u64 = recipient.parse().map_err(|e| {
            rushdino_common::AppError::Agent(format!(
                "invalid discord channel id '{recipient}': {e}"
            ))
        })?;
        let channel_id = ChannelId::new(channel_id_u64);

        match plan_delivery(&msg, &self.capabilities()) {
            DiscordDeliveryPlan::TextOnly { text } => {
                send_plain_message(http.as_ref(), channel_id, &text).await?;
                Ok(DeliveryOutcome::default())
            }
            DiscordDeliveryPlan::Degraded { text, reason } => {
                send_plain_message(http.as_ref(), channel_id, &text).await?;
                Ok(DeliveryOutcome {
                    fallback_reason: Some(reason),
                })
            }
            DiscordDeliveryPlan::NativeMessage {
                content,
                embed_description,
                image_url,
                buttons,
            } => {
                if let Err(err) = send_native_message(
                    http.as_ref(),
                    channel_id,
                    content,
                    embed_description,
                    image_url,
                    buttons,
                )
                .await
                {
                    let degraded = render_markdown_fallback_message(&msg, &self.capabilities());
                    send_plain_message(http.as_ref(), channel_id, &degraded).await?;
                    return Ok(DeliveryOutcome {
                        fallback_reason: Some(format!(
                            "discord native delivery degraded after API rejection: {err}"
                        )),
                    });
                }

                Ok(DeliveryOutcome::default())
            }
        }
    }
}

async fn send_plain_message(
    http: &serenity::http::Http,
    channel_id: ChannelId,
    text: &str,
) -> Result<()> {
    channel_id
        .send_message(http, CreateMessage::new().content(text.to_owned()))
        .await
        .map_err(|e| rushdino_common::AppError::Agent(format!("discord send: {e}")))?;
    Ok(())
}

async fn send_native_message(
    http: &serenity::http::Http,
    channel_id: ChannelId,
    content: Option<String>,
    embed_description: Option<String>,
    image_url: Option<String>,
    buttons: Vec<rushdino_common::LinkTarget>,
) -> Result<()> {
    let mut message = CreateMessage::new();
    if let Some(content) = content {
        message = message.content(content);
    }
    if embed_description.is_some() || image_url.is_some() {
        let mut embed = CreateEmbed::new();
        if let Some(description) = embed_description {
            embed = embed.description(description);
        }
        if let Some(image_url) = image_url {
            embed = embed.image(image_url);
        }
        message = message.embed(embed);
    }
    if !buttons.is_empty() {
        let row = CreateActionRow::Buttons(
            buttons
                .into_iter()
                .map(|item| CreateButton::new_link(item.url).label(item.label))
                .collect(),
        );
        message = message.components(vec![row]);
    }
    channel_id
        .send_message(http, message)
        .await
        .map_err(|e| rushdino_common::AppError::Agent(format!("discord send: {e}")))?;
    Ok(())
}
