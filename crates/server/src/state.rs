use std::{sync::Arc, time::Instant};

use rushdino_agent::AgentEngine;
use rushdino_common::AppConfig;

#[derive(Clone)]
pub struct AppState {
    pub engine: Arc<AgentEngine>,
    pub config: Arc<AppConfig>,
    pub start_time: Instant,
}

impl AppState {
    pub fn new(engine: Arc<AgentEngine>, config: Arc<AppConfig>) -> Self {
        Self {
            engine,
            config,
            start_time: Instant::now(),
        }
    }
}
