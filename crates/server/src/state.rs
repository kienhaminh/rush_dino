use std::{path::PathBuf, sync::Arc, time::Instant};

use rushdino_gateway::{GatewayControl, GatewayStateStore, SessionManager};
use rushdino_security::rate_limit::EndpointLimiters;

use crate::approval_gate::ApprovalGate;
use crate::channel_pairing::ChannelPairingService;
use crate::chat_broadcast::ChatBroadcastHub;
use crate::middleware::HmacAuthState;
use crate::runtime_log_store::RuntimeLogStore;
use crate::runtime_state::{RuntimeState, RuntimeStatus};
use crate::webchat::WebChatAdapter;
use rushdino_agent::AgentEngine;
use rushdino_common::dashboard_auth::DashboardAuthService;
use rushdino_common::{AppConfig, Result};

#[derive(Clone)]
pub struct AppState {
    pub runtime: Arc<RuntimeState>,
    pub start_time: Instant,
    /// Path to config.toml — used by config API routes for read/write.
    pub config_path: PathBuf,
    /// Path to credentials.toml — used by config API routes for read/write.
    pub credentials_path: PathBuf,
    /// WebChat adapter shared with the gateway — used by the WebSocket handler.
    pub webchat: Arc<WebChatAdapter>,
    /// Session-scoped tool approval gate for dangerous tool commands.
    pub gate: Arc<ApprovalGate>,
    /// Gateway adapter lifecycle state for UI/admin routes.
    pub gateway_state: Arc<GatewayStateStore>,
    /// Shared gateway session manager.
    pub gateway_sessions: Arc<SessionManager>,
    /// Gateway control plane for adapter restart and lifecycle actions.
    pub gateway_control: GatewayControl,
    /// HMAC authentication state — `None` when auth is disabled.
    pub hmac_auth: Option<Arc<HmacAuthState>>,
    /// Per-endpoint rate limiters — `None` when rate limiting is disabled.
    pub rate_limiters: Option<Arc<EndpointLimiters>>,
    /// SQLite-backed runtime logs store.
    pub runtime_logs: Arc<RuntimeLogStore>,
    /// Broadcast hub used by the primary chat UI for gateway-originated events.
    pub chat_broadcast: Arc<ChatBroadcastHub>,
    /// SQLite-backed channel pairing state store.
    pub channel_pairing: Arc<ChannelPairingService>,
    /// SQLite-backed dashboard auth state store.
    pub dashboard_auth: Arc<DashboardAuthService>,
}

impl AppState {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        runtime: Arc<RuntimeState>,
        config_path: PathBuf,
        credentials_path: PathBuf,
        webchat: Arc<WebChatAdapter>,
        gate: Arc<ApprovalGate>,
        gateway_state: Arc<GatewayStateStore>,
        gateway_sessions: Arc<SessionManager>,
        gateway_control: GatewayControl,
        hmac_auth: Option<Arc<HmacAuthState>>,
        rate_limiters: Option<Arc<EndpointLimiters>>,
        runtime_logs: Arc<RuntimeLogStore>,
        chat_broadcast: Arc<ChatBroadcastHub>,
        channel_pairing: Arc<ChannelPairingService>,
        dashboard_auth: Arc<DashboardAuthService>,
    ) -> Self {
        Self {
            runtime,
            start_time: Instant::now(),
            config_path,
            credentials_path,
            webchat,
            gate,
            gateway_state,
            gateway_sessions,
            gateway_control,
            hmac_auth,
            rate_limiters,
            runtime_logs,
            chat_broadcast,
            channel_pairing,
            dashboard_auth,
        }
    }

    pub fn config(&self) -> Arc<AppConfig> {
        self.runtime.config()
    }

    pub fn engine(&self) -> Result<Arc<AgentEngine>> {
        self.runtime.engine()
    }

    pub fn engine_opt(&self) -> Option<Arc<AgentEngine>> {
        self.runtime.engine_opt()
    }

    pub fn system_broker(&self) -> rushdino_agent::SharedSystemBroker {
        self.runtime.system_broker()
    }

    pub fn knowledge_graph(&self) -> Option<Arc<rushdino_knowledge_graph::KnowledgeGraphService>> {
        self.runtime.knowledge_graph()
    }

    pub fn runtime_status(&self) -> RuntimeStatus {
        self.runtime.status()
    }
}
