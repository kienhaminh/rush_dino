use std::{collections::HashMap, path::PathBuf, sync::Arc, time::Instant};

use rushdino_gateway::{GatewayControl, GatewayStateStore, SessionManager};
use rushdino_security::guardrail::pipeline::GuardrailPipeline;
use rushdino_security::rate_limit::EndpointLimiters;
use tokio::sync::RwLock;

use crate::approval_gate::ApprovalGate;
use crate::channel_pairing::ChannelPairingService;
use crate::chat_broadcast::ChatBroadcastHub;
use crate::mcp_manager::McpManager;
use crate::middleware::HmacAuthState;
use crate::runtime_log_store::RuntimeLogStore;
use crate::runtime_state::{RuntimeState, RuntimeStatus};
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
    pub pipelines: RwLock<HashMap<String, Arc<GuardrailPipeline>>>,
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
        })
    }

    /// Register the guardrail pipeline for a newly started agent session.
    pub async fn register_session(&self, session_id: &str, pipeline: Arc<GuardrailPipeline>) {
        self.pipelines.write().await.insert(session_id.to_owned(), pipeline);
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
    /// Guardrail registry: maps session IDs to their per-session guardrail pipelines.
    pub guardrail_registry: Arc<GuardrailRegistry>,
    /// Temporary OAuth PKCE sessions for UI-driven headless login.
    pub pending_oauth: Arc<PendingOAuthStore>,
    /// Skill graph service for keyword-based skill routing.
    pub skill_graph: Arc<rushdino_skill_graph::SkillGraphService>,
    /// MCP server manager — manages connections and discovered tools.
    pub mcp_manager: Arc<McpManager>,
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
        guardrail_registry: Arc<GuardrailRegistry>,
        pending_oauth: Arc<PendingOAuthStore>,
        skill_graph: Arc<rushdino_skill_graph::SkillGraphService>,
        mcp_manager: Arc<McpManager>,
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
            guardrail_registry,
            pending_oauth,
            skill_graph,
            mcp_manager,
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

    pub fn skill_graph(&self) -> &Arc<rushdino_skill_graph::SkillGraphService> {
        &self.skill_graph
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
