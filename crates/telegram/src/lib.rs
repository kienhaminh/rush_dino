mod handler;
mod util;

use std::sync::Arc;

use rushdino_agent::AgentEngine;
use rushdino_common::{AppConfig, CredentialsConfig, Result};

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
