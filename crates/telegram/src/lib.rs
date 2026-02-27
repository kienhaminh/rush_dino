mod handler;
mod util;

use std::sync::Arc;

use async_trait::async_trait;
use teloxide::prelude::*;
use tokio::sync::mpsc;

use rushdino_agent::AgentEngine;
use rushdino_common::{AppConfig, CredentialsConfig, Result};
use rushdino_gateway::{ChannelAdapter, IncomingMessage, OutgoingMessage};

use crate::util::{escape_html, split_message};

/// Telegram channel adapter — wraps the existing teloxide handler.
pub struct TelegramAdapter {
    token: String,
    config: Arc<AppConfig>,
}

impl TelegramAdapter {
    pub fn new(token: String, config: Arc<AppConfig>) -> Self {
        Self { token, config }
    }
}

#[async_trait]
impl ChannelAdapter for TelegramAdapter {
    fn channel_id(&self) -> &str {
        "telegram"
    }

    async fn start(&self, tx: mpsc::Sender<IncomingMessage>) -> Result<()> {
        let bot = Bot::new(&self.token);
        let config = self.config.clone();

        teloxide::repl(bot.clone(), move |bot: Bot, msg: Message| {
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
                let incoming = IncomingMessage {
                    channel_id: "telegram".to_owned(),
                    sender_id: msg.chat.id.0.to_string(),
                    text: text.to_owned(),
                    timestamp: chrono::Utc::now(),
                };
                let _ = tx.send(incoming).await;

                respond(())
            }
        })
        .await;

        Ok(())
    }

    async fn send_message(&self, recipient: &str, msg: OutgoingMessage) -> Result<()> {
        let bot = Bot::new(&self.token);
        let chat_id: i64 = recipient
            .parse()
            .map_err(|e| rushdino_common::AppError::Agent(format!("invalid telegram id: {e}")))?;
        let chat_id = ChatId(chat_id);

        for chunk in split_message(&escape_html(&msg.text), 4096) {
            let _ = bot
                .send_message(chat_id, chunk)
                .parse_mode(teloxide::types::ParseMode::Html)
                .await;
        }

        Ok(())
    }
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
