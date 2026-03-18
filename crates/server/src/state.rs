use std::{collections::HashMap, path::PathBuf, sync::Arc, time::Instant};

use rushdino_gateway::{GatewayControl, GatewayStateStore, SessionManager};
use rushdino_security::approval_gate::ApprovalGate as SandboxApprovalGate;
use rushdino_security::egress_proxy::EgressProxy;
use rushdino_security::rate_limit::EndpointLimiters;
use tokio::sync::RwLock;

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

// ---------------------------------------------------------------------------
// SandboxRegistry
// ---------------------------------------------------------------------------

/// Shared registry mapping active session IDs to their sandbox components.
///
/// Stored in `AppState` and cloned cheaply via `Arc`. Routes use it to
/// perform hot-reloads, audit-log queries, and approve/deny pending sandbox
/// network requests.
pub struct SandboxRegistry {
    /// session_id → EgressProxy — enables network policy hot-reload per session.
    pub proxies: RwLock<HashMap<String, Arc<EgressProxy>>>,
    /// session_id → ApprovalGate — enables approve/deny of pending egress requests.
    pub approval_gates: RwLock<HashMap<String, Arc<SandboxApprovalGate>>>,
    /// Shared SQLite pool for audit log queries.
    pub pool: Arc<sqlx::SqlitePool>,
    /// Base directory under which `{agent_id}/sandbox.yaml` files live.
    pub agents_dir: PathBuf,
}

impl SandboxRegistry {
    /// Create a new, empty registry wrapped in an `Arc`.
    pub fn new(pool: Arc<sqlx::SqlitePool>, agents_dir: PathBuf) -> Arc<Self> {
        Arc::new(Self {
            proxies: RwLock::new(HashMap::new()),
            approval_gates: RwLock::new(HashMap::new()),
            pool,
            agents_dir,
        })
    }

    /// Register the sandbox components for a newly started agent session.
    pub async fn register_session(
        &self,
        session_id: String,
        proxy: Arc<EgressProxy>,
        gate: Arc<SandboxApprovalGate>,
    ) {
        self.proxies.write().await.insert(session_id.clone(), proxy);
        self.approval_gates.write().await.insert(session_id, gate);
    }

    /// Remove all sandbox components for a completed or aborted session.
    pub async fn unregister_session(&self, session_id: &str) {
        self.proxies.write().await.remove(session_id);
        self.approval_gates.write().await.remove(session_id);
    }
}

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
    /// Sandbox registry: maps session IDs to their egress proxies and approval gates.
    pub sandbox_registry: Arc<SandboxRegistry>,
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
        sandbox_registry: Arc<SandboxRegistry>,
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
            sandbox_registry,
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
