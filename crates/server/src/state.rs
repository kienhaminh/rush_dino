use std::{path::PathBuf, sync::Arc, time::Instant};

use rushdino_agent::AgentEngine;
use rushdino_common::AppConfig;
use rushdino_knowledge_graph::KnowledgeGraphService;
use rushdino_security::rate_limit::EndpointLimiters;

use crate::approval_gate::ApprovalGate;
use crate::middleware::HmacAuthState;
use crate::runtime_log_store::RuntimeLogStore;
use crate::webchat::WebChatAdapter;

#[derive(Clone)]
pub struct AppState {
    pub engine: Arc<AgentEngine>,
    pub config: Arc<AppConfig>,
    pub start_time: Instant,
    /// Path to config.toml — used by config API routes for read/write.
    pub config_path: PathBuf,
    /// Path to credentials.toml — used by config API routes for read/write.
    pub credentials_path: PathBuf,
    /// WebChat adapter shared with the gateway — used by the WebSocket handler.
    pub webchat: Arc<WebChatAdapter>,
    /// Session-scoped tool approval gate for dangerous tool commands.
    pub gate: Arc<ApprovalGate>,
    /// HMAC authentication state — `None` when auth is disabled.
    pub hmac_auth: Option<Arc<HmacAuthState>>,
    /// Per-endpoint rate limiters — `None` when rate limiting is disabled.
    pub rate_limiters: Option<Arc<EndpointLimiters>>,
    /// Local knowledge graph service (optional).
    pub knowledge_graph: Option<Arc<KnowledgeGraphService>>,
    /// SQLite-backed runtime logs store.
    pub runtime_logs: Arc<RuntimeLogStore>,
}

impl AppState {
    pub fn new(
        engine: Arc<AgentEngine>,
        config: Arc<AppConfig>,
        config_path: PathBuf,
        credentials_path: PathBuf,
        webchat: Arc<WebChatAdapter>,
        gate: Arc<ApprovalGate>,
        hmac_auth: Option<Arc<HmacAuthState>>,
        rate_limiters: Option<Arc<EndpointLimiters>>,
        knowledge_graph: Option<Arc<KnowledgeGraphService>>,
        runtime_logs: Arc<RuntimeLogStore>,
    ) -> Self {
        Self {
            engine,
            config,
            start_time: Instant::now(),
            config_path,
            credentials_path,
            webchat,
            gate,
            hmac_auth,
            rate_limiters,
            knowledge_graph,
            runtime_logs,
        }
    }
}
