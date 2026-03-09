mod draft_api;
mod draft_preview;
mod handler;
mod rich_delivery;
mod util;

use std::sync::Arc;

use async_trait::async_trait;
use teloxide::{
    dispatching::{Dispatcher, UpdateFilterExt},
    error_handlers::LoggingErrorHandler,
    prelude::*,
    types::{InlineKeyboardButton, InlineKeyboardMarkup, InputFile, ParseMode, Update},
    update_listeners,
};
use tokio::task::JoinHandle;
use url::Url;

use rushdino_agent::AgentEngine;
use rushdino_common::{AppConfig, AppError, CredentialsConfig, Result};
use rushdino_gateway::{
    rich_message::render_html_fallback_message, AdapterContext, ChannelAdapter, DeliveryOutcome,
    DeliveryPreview, GatewayAdapterCapabilities, GatewayRichDeliveryMode, IncomingMessage,
    OutgoingMessage, PreviewUpdateOutcome,
};

use crate::draft_preview::{TelegramPreviewBackendImpl, TelegramPreviewManager};
use crate::rich_delivery::{plan_delivery, TelegramDeliveryPlan};
use crate::util::split_message;

/// Telegram channel adapter — wraps the existing teloxide handler.
pub struct TelegramAdapter {
    bot: Bot,
    config: Arc<AppConfig>,
    preview_manager: TelegramPreviewManager,
}

impl TelegramAdapter {
    pub fn new(token: String, config: Arc<AppConfig>) -> Self {
        let bot = Bot::new(token.clone());
        let preview_manager = TelegramPreviewManager::new(Arc::new(
            TelegramPreviewBackendImpl::new(bot.clone(), token),
        ));
        Self {
            bot,
            config,
            preview_manager,
        }
    }
}

#[async_trait]
impl ChannelAdapter for TelegramAdapter {
    fn channel_id(&self) -> &str {
        "telegram"
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
        let bot = self.bot.clone();
        let config = self.config.clone();
        let tx = context.inbound_tx.clone();
        let mut shutdown_rx = context.shutdown_rx.clone();

        let handler = Update::filter_message().endpoint(move |bot: Bot, msg: Message| {
            let tx = tx.clone();
            let config = config.clone();
            async move {
                let Some(text) = msg.text() else {
                    return respond(());
                };

                // Honour allowed_chat_ids gate
                if !config.allowed_chat_ids.is_empty()
                    && !config.allowed_chat_ids.contains(&msg.chat.id.0)
                {
                    return respond(());
                }

                // Handle built-in commands locally
                if text == "/start" {
                    let greeting = format!(
                        "RushDino ready. Provider: {:?}. Model: {}",
                        config.active_provider, config.ollama.model
                    );
                    let _ = bot
                        .send_message(msg.chat.id, greeting)
                        .parse_mode(teloxide::types::ParseMode::Html)
                        .await;
                    return respond(());
                }

                // Forward to gateway router
                let actor_id = msg
                    .from
                    .as_ref()
                    .map(|user| user.id.0.to_string())
                    .unwrap_or_else(|| msg.chat.id.0.to_string());
                let actor_display = msg
                    .from
                    .as_ref()
                    .map(|user| user.username.clone().unwrap_or_else(|| user.full_name()));
                let incoming = IncomingMessage {
                    channel_id: "telegram".to_owned(),
                    sender_id: msg.chat.id.0.to_string(),
                    actor_id,
                    actor_display,
                    reply_target: msg.chat.id.0.to_string(),
                    is_direct_message: msg.chat.is_private(),
                    enable_streaming_preview: config.gateway.telegram.native_streaming
                        && msg.chat.is_private(),
                    external_message_id: Some(msg.id.0.to_string()),
                    text: text.to_owned(),
                    timestamp: chrono::Utc::now(),
                };
                let _ = tx.send(incoming).await;

                respond(())
            }
        });

        let ignore_update = |_upd| Box::pin(async {});
        let listener = update_listeners::polling_default(bot.clone()).await;
        let mut dispatcher = Dispatcher::builder(bot, handler)
            .default_handler(ignore_update)
            .build();
        let shutdown_token = dispatcher.shutdown_token();
        let shutdown_task: JoinHandle<()> = tokio::spawn(async move {
            loop {
                if shutdown_rx.changed().await.is_err() {
                    break;
                }
                if *shutdown_rx.borrow() {
                    if let Ok(wait_for_shutdown) = shutdown_token.shutdown() {
                        wait_for_shutdown.await;
                    }
                    break;
                }
            }
        });
        context.lifecycle.connected().await;
        let dispatch_result = dispatcher
            .try_dispatch_with_listener(
                listener,
                LoggingErrorHandler::with_custom_text("An error from the update listener"),
            )
            .await
            .map_err(|err| AppError::Agent(format!("telegram dispatcher startup failed: {err}")));
        shutdown_task.abort();
        let _ = shutdown_task.await;
        dispatch_result?;

        Ok(())
    }

    fn preview_delivery(&self, msg: &OutgoingMessage) -> DeliveryPreview {
        match plan_delivery(msg, &self.capabilities()) {
            TelegramDeliveryPlan::Degraded { reason, .. } => DeliveryPreview {
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
        let bot = self.bot.clone();
        let chat_id = parse_chat_id(recipient)?;

        match plan_delivery(&msg, &self.capabilities()) {
            TelegramDeliveryPlan::TextOnly { html } => {
                send_html_chunks(&bot, chat_id, &html).await?;
                Ok(DeliveryOutcome::default())
            }
            TelegramDeliveryPlan::Degraded { html, reason } => {
                send_html_chunks(&bot, chat_id, &html).await?;
                Ok(DeliveryOutcome {
                    fallback_reason: Some(reason),
                })
            }
            TelegramDeliveryPlan::NativeMessage { html, buttons } => {
                if let Err(err) =
                    send_native_text_message(&bot, chat_id, &html, build_keyboard(&buttons)).await
                {
                    let degraded = render_html_fallback_message(&msg, &self.capabilities());
                    send_html_chunks(&bot, chat_id, &degraded).await?;
                    return Ok(DeliveryOutcome {
                        fallback_reason: Some(format!(
                            "telegram native delivery degraded after send_message failure: {err}"
                        )),
                    });
                }

                Ok(DeliveryOutcome::default())
            }
            TelegramDeliveryPlan::NativePhoto {
                image_url,
                caption_html,
                buttons,
            } => {
                if let Err(err) = send_native_photo(
                    &bot,
                    chat_id,
                    &image_url,
                    &caption_html,
                    build_keyboard(&buttons),
                )
                .await
                {
                    let degraded = render_html_fallback_message(&msg, &self.capabilities());
                    send_html_chunks(&bot, chat_id, &degraded).await?;
                    return Ok(DeliveryOutcome {
                        fallback_reason: Some(format!(
                            "telegram native delivery degraded after send_photo failure: {err}"
                        )),
                    });
                }

                Ok(DeliveryOutcome::default())
            }
        }
    }

    async fn update_preview(
        &self,
        run_id: &str,
        recipient: &str,
        text: &str,
    ) -> Result<PreviewUpdateOutcome> {
        self.preview_manager
            .update(run_id, parse_chat_id(recipient)?, text)
            .await
    }

    async fn finalize_preview(&self, run_id: &str, recipient: &str) -> Result<()> {
        self.preview_manager
            .finalize(run_id, parse_chat_id(recipient)?)
            .await
    }

    async fn clear_preview(&self, run_id: &str, recipient: &str) -> Result<()> {
        self.preview_manager
            .clear(run_id, parse_chat_id(recipient)?)
            .await
    }
}

fn build_keyboard(items: &[rushdino_common::LinkTarget]) -> Option<InlineKeyboardMarkup> {
    if items.is_empty() {
        return None;
    }

    let row = items
        .iter()
        .filter_map(|item| {
            Url::parse(&item.url)
                .ok()
                .map(|url| InlineKeyboardButton::url(item.label.clone(), url))
        })
        .collect::<Vec<_>>();
    if row.is_empty() {
        None
    } else {
        Some(InlineKeyboardMarkup::new(vec![row]))
    }
}

pub(crate) async fn send_html_chunks(bot: &Bot, chat_id: ChatId, html: &str) -> Result<()> {
    for chunk in split_message(html, 4096) {
        bot.send_message(chat_id, chunk)
            .parse_mode(ParseMode::Html)
            .await
            .map_err(|err| AppError::Agent(format!("telegram send_message: {err}")))?;
    }
    Ok(())
}

async fn send_native_text_message(
    bot: &Bot,
    chat_id: ChatId,
    html: &str,
    keyboard: Option<InlineKeyboardMarkup>,
) -> Result<()> {
    let mut request = bot
        .send_message(chat_id, html.to_owned())
        .parse_mode(ParseMode::Html);
    if let Some(keyboard) = keyboard {
        request = request.reply_markup(keyboard);
    }
    request
        .await
        .map_err(|err| AppError::Agent(format!("telegram send_message: {err}")))?;
    Ok(())
}

async fn send_native_photo(
    bot: &Bot,
    chat_id: ChatId,
    image_url: &str,
    caption_html: &str,
    keyboard: Option<InlineKeyboardMarkup>,
) -> Result<()> {
    let url = Url::parse(image_url)
        .map_err(|err| AppError::Validation(format!("invalid image URL: {err}")))?;
    let mut request = bot.send_photo(chat_id, InputFile::url(url));
    if !caption_html.trim().is_empty() {
        request = request
            .caption(caption_html.to_owned())
            .parse_mode(ParseMode::Html);
    }
    if let Some(keyboard) = keyboard {
        request = request.reply_markup(keyboard);
    }
    request
        .await
        .map_err(|err| AppError::Agent(format!("telegram send_photo: {err}")))?;
    Ok(())
}

/// Backward-compatible entry point used before gateway wiring was added.
/// The server calls this when gateway is not yet in use.
pub async fn start_bot(
    engine: Arc<AgentEngine>,
    config: Arc<AppConfig>,
    credentials: Arc<CredentialsConfig>,
) -> Result<()> {
    let token = credentials.telegram_bot_token.clone().unwrap_or_default();
    if token.trim().is_empty() {
        tracing::warn!("telegram token missing, bot disabled");
        return Ok(());
    }
    handler::run_bot(token, engine, config).await
}

fn parse_chat_id(recipient: &str) -> Result<ChatId> {
    let chat_id = recipient
        .parse()
        .map_err(|err| AppError::Agent(format!("invalid telegram id: {err}")))?;
    Ok(ChatId(chat_id))
}
