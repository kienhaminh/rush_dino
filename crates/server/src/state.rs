use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Instant,
};

use rushdino_gateway::{GatewayControl, GatewayStateStore, SessionManager};
use rushdino_security::guardrail::pipeline::GuardrailPipeline;
use rushdino_security::guardrail::trust_state::TrustState;
use rushdino_security::rate_limit::EndpointLimiters;
use tokio::sync::RwLock;

use crate::approval_gate::ApprovalGate;
use crate::channel_pairing::ChannelPairingService;
use crate::chat_broadcast::ChatBroadcastHub;
use crate::input_request_gate::InputRequestGate;
use crate::mcp_manager::McpManager;
use crate::middleware::HmacAuthState;
use crate::mobile_gateway::{MobileGatewayAdapter, MobileGatewayService};
use crate::runtime_log_store::RuntimeLogStore;
use crate::runtime_state::{RuntimeState, RuntimeStatus};
use crate::secret_vault::SharedSecretVault;
use crate::webchat::WebChatAdapter;
use rushdino_agent::AgentEngine;
use rushdino_auth::oauth_pkce::PendingOAuthLogin;
use rushdino_common::dashboard_auth::DashboardAuthService;
use rushdino_common::{AppConfig, Result};

// ---------------------------------------------------------------------------
// GuardrailRegistry
// ---------------------------------------------------------------------------

/// Per-session guardrail pipelines for isolated trust state tracking.
///
/// Stored in `AppState` and cloned cheaply via `Arc`. Routes use it to
/// retrieve the per-session pipeline for trust and policy state queries.
pub struct GuardrailRegistry {
    /// Active session pipelines, keyed by session_id.
    pub pipelines: RwLock<HashMap<String, Arc<GuardrailPipeline>>>,
    /// Persisted per-agent trust state, keyed by agent_id.
    /// Used by guardrail API routes when no active session exists for the agent.
    agent_states: RwLock<HashMap<String, Arc<Mutex<TrustState>>>>,
}

#[derive(Clone, Debug)]
pub struct PendingOAuthSession {
    pub profile_id: String,
    pub verifier: String,
    pub state: String,
    pub auth_url: String,
    pub created_at: Instant,
}

impl PendingOAuthSession {
    pub fn from_login(profile_id: String, login: PendingOAuthLogin, created_at: Instant) -> Self {
        Self {
            profile_id,
            verifier: login.verifier,
            state: login.state,
            auth_url: login.auth_url,
            created_at,
        }
    }
}

#[derive(Default)]
pub struct PendingOAuthStore {
    sessions: RwLock<HashMap<String, PendingOAuthSession>>,
}

impl PendingOAuthStore {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub async fn insert(&self, session_id: String, session: PendingOAuthSession) {
        self.sessions.write().await.insert(session_id, session);
    }

    pub async fn get(&self, session_id: &str) -> Option<PendingOAuthSession> {
        self.sessions.read().await.get(session_id).cloned()
    }

    pub async fn remove(&self, session_id: &str) -> Option<PendingOAuthSession> {
        self.sessions.write().await.remove(session_id)
    }

    pub async fn take_if_fresh(
        &self,
        session_id: &str,
        max_age: std::time::Duration,
        now: Instant,
    ) -> Option<PendingOAuthSession> {
        let mut sessions = self.sessions.write().await;
        let session = sessions.get(session_id)?.clone();
        if now.duration_since(session.created_at) > max_age {
            sessions.remove(session_id);
            return None;
        }
        sessions.remove(session_id)
    }
}

impl GuardrailRegistry {
    /// Create a new, empty registry wrapped in an `Arc`.
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            pipelines: RwLock::new(HashMap::new()),
            agent_states: RwLock::new(HashMap::new()),
        })
    }

    /// Return the trust state for an agent, preferring an active session pipeline.
    /// Creates and stores a default state if none exists.
    pub async fn get_or_init_agent_state(&self, agent_id: &str) -> Arc<Mutex<TrustState>> {
        // Prefer the live trust state from an active session pipeline.
        {
            let pipelines = self.pipelines.read().await;
            for pipeline in pipelines.values() {
                let ts = pipeline.trust_state();
                if ts.lock().unwrap().agent_id() == agent_id {
                    return ts;
                }
            }
        }
        // Fall back to the persisted agent-level state.
        let mut states = self.agent_states.write().await;
        states
            .entry(agent_id.to_owned())
            .or_insert_with(|| Arc::new(Mutex::new(TrustState::new(agent_id))))
            .clone()
    }

    /// Register the guardrail pipeline for a newly started agent session.
    pub async fn register_session(&self, session_id: &str, pipeline: Arc<GuardrailPipeline>) {
        self.pipelines
            .write()
            .await
            .insert(session_id.to_owned(), pipeline);
    }

    /// Remove the guardrail pipeline for a completed or aborted session.
    pub async fn unregister_session(&self, session_id: &str) {
        self.pipelines.write().await.remove(session_id);
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
    /// Session-scoped input request gate for interactive question/form tools.
    pub input_gate: Arc<InputRequestGate>,
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
    /// SQLite-backed mobile gateway API key store.
    pub mobile_gateway: Arc<MobileGatewayService>,
    /// Mobile gateway adapter shared with the gateway and WS route.
    pub mobile_gateway_adapter: Arc<MobileGatewayAdapter>,
    /// Guardrail registry: maps session IDs to their per-session guardrail pipelines.
    pub guardrail_registry: Arc<GuardrailRegistry>,
    /// Temporary OAuth PKCE sessions for UI-driven headless login.
    pub pending_oauth: Arc<PendingOAuthStore>,
    /// MCP server manager — manages connections and discovered tools.
    pub mcp_manager: Arc<McpManager>,
    /// In-memory vault for sensitive values collected via secret input fields.
    /// Agent receives opaque tokens; real values are resolved server-side before execution.
    pub secret_vault: SharedSecretVault,
}

/// All services needed to construct an `AppState`.
pub struct AppStateConfig {
    pub runtime: Arc<RuntimeState>,
    pub config_path: PathBuf,
    pub credentials_path: PathBuf,
    pub webchat: Arc<WebChatAdapter>,
    pub gate: Arc<ApprovalGate>,
    pub input_gate: Arc<InputRequestGate>,
    pub gateway_state: Arc<GatewayStateStore>,
    pub gateway_sessions: Arc<SessionManager>,
    pub gateway_control: GatewayControl,
    pub hmac_auth: Option<Arc<HmacAuthState>>,
    pub rate_limiters: Option<Arc<EndpointLimiters>>,
    pub runtime_logs: Arc<RuntimeLogStore>,
    pub chat_broadcast: Arc<ChatBroadcastHub>,
    pub channel_pairing: Arc<ChannelPairingService>,
    pub dashboard_auth: Arc<DashboardAuthService>,
    pub mobile_gateway: Arc<MobileGatewayService>,
    pub mobile_gateway_adapter: Arc<MobileGatewayAdapter>,
    pub guardrail_registry: Arc<GuardrailRegistry>,
    pub pending_oauth: Arc<PendingOAuthStore>,
    pub mcp_manager: Arc<McpManager>,
    pub secret_vault: SharedSecretVault,
}

impl AppState {
    pub fn new(cfg: AppStateConfig) -> Self {
        Self {
            runtime: cfg.runtime,
            start_time: Instant::now(),
            config_path: cfg.config_path,
            credentials_path: cfg.credentials_path,
            webchat: cfg.webchat,
            gate: cfg.gate,
            input_gate: cfg.input_gate,
            gateway_state: cfg.gateway_state,
            gateway_sessions: cfg.gateway_sessions,
            gateway_control: cfg.gateway_control,
            hmac_auth: cfg.hmac_auth,
            rate_limiters: cfg.rate_limiters,
            runtime_logs: cfg.runtime_logs,
            chat_broadcast: cfg.chat_broadcast,
            channel_pairing: cfg.channel_pairing,
            dashboard_auth: cfg.dashboard_auth,
            mobile_gateway: cfg.mobile_gateway,
            mobile_gateway_adapter: cfg.mobile_gateway_adapter,
            guardrail_registry: cfg.guardrail_registry,
            pending_oauth: cfg.pending_oauth,
            mcp_manager: cfg.mcp_manager,
            secret_vault: cfg.secret_vault,
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

    pub fn knowledge_graph(&self) -> Option<Arc<rushdino_knowledge_graph::KgGateway>> {
        self.runtime.knowledge_graph()
    }

    pub fn runtime_status(&self) -> RuntimeStatus {
        self.runtime.status()
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use rushdino_auth::oauth_pkce::PendingOAuthLogin;

    use super::{PendingOAuthSession, PendingOAuthStore};

    fn pending_login() -> PendingOAuthLogin {
        PendingOAuthLogin {
            verifier: "verifier".to_owned(),
            state: "state".to_owned(),
            auth_url: "https://example.test/oauth".to_owned(),
        }
    }

    #[tokio::test]
    async fn pending_oauth_store_returns_fresh_session() {
        let store = PendingOAuthStore::new();
        let created_at = std::time::Instant::now();
        store
            .insert(
                "session-1".to_owned(),
                PendingOAuthSession::from_login(
                    "profile-1".to_owned(),
                    pending_login(),
                    created_at,
                ),
            )
            .await;

        let session = store
            .take_if_fresh("session-1", Duration::from_secs(300), created_at)
            .await
            .expect("fresh session should exist");

        assert_eq!(session.profile_id, "profile-1");
        assert!(store.get("session-1").await.is_none());
    }

    #[tokio::test]
    async fn pending_oauth_store_expires_old_session() {
        let store = PendingOAuthStore::new();
        let created_at = std::time::Instant::now();
        store
            .insert(
                "session-1".to_owned(),
                PendingOAuthSession::from_login(
                    "profile-1".to_owned(),
                    pending_login(),
                    created_at,
                ),
            )
            .await;

        let session = store
            .take_if_fresh(
                "session-1",
                Duration::from_secs(300),
                created_at + Duration::from_secs(301),
            )
            .await;

        assert!(session.is_none());
        assert!(store.get("session-1").await.is_none());
    }
}
