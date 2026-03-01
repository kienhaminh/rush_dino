use std::{sync::Arc, time::Instant};

use teloxide::prelude::*;

use rushdino_agent::AgentEngine;
use rushdino_common::{AppConfig, Result};

use crate::util::{escape_html, split_message};

pub async fn run_bot(token: String, engine: Arc<AgentEngine>, config: Arc<AppConfig>) -> Result<()> {
    let bot = Bot::new(token);
    let start = Instant::now();

    teloxide::repl(bot, move |bot: Bot, msg: Message| {
        let engine = engine.clone();
        let config = config.clone();
        async move {
            let Some(text) = msg.text() else {
                return respond(());
            };

            if !config.allowed_chat_ids.is_empty()
                && !config.allowed_chat_ids.contains(&msg.chat.id.0)
            {
                return respond(());
            }

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

            if text == "/status" {
                let body = format!(
                    "Uptime: {}s\nProvider: {:?}\nModel: {}",
                    start.elapsed().as_secs(),
                    config.active_provider,
                    config.ollama.model
                );
                let _ = bot
                    .send_message(msg.chat.id, body)
                    .parse_mode(teloxide::types::ParseMode::Html)
                    .await;
                return respond(());
            }

            let conv_id = format!("tg-{}", msg.chat.id.0);
            let reply = match engine.chat(&conv_id, text).await {
                Ok(response) => response.content,
                Err(err) => format!("Agent error: {err}"),
            };

            for chunk in split_message(&escape_html(&reply), 4096) {
                let _ = bot
                    .send_message(msg.chat.id, chunk)
                    .parse_mode(teloxide::types::ParseMode::Html)
                    .await;
            }

            respond(())
        }
    })
    .await;

    Ok(())
}
