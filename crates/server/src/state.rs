use std::{sync::Arc, time::Instant};

use rushdino_agent::AgentEngine;
use rushdino_common::AppConfig;

use crate::webchat::WebChatAdapter;

#[derive(Clone)]
pub struct AppState {
    pub engine: Arc<AgentEngine>,
    pub config: Arc<AppConfig>,
    pub start_time: Instant,
    /// WebChat adapter shared with the gateway — used by the WebSocket handler.
    pub webchat: Arc<WebChatAdapter>,
}

impl AppState {
    pub fn new(
        engine: Arc<AgentEngine>,
        config: Arc<AppConfig>,
        webchat: Arc<WebChatAdapter>,
    ) -> Self {
        Self {
            engine,
            config,
            start_time: Instant::now(),
            webchat,
        }
    }
}
