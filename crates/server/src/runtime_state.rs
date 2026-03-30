use std::{
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
};

use arc_swap::{ArcSwap, ArcSwapOption};
use sqlx::SqlitePool;

use rushdino_agent::{AgentEngine, AgentRuntime, SharedSystemBroker};
use rushdino_common::{config::Provider, AppConfig, AppError, Result};
use rushdino_knowledge_graph::KgGateway;
use rushdino_providers::types::ThinkingLevel;
use rushdino_skill_graph::SkillGraphService;

#[derive(Debug, Clone, Default)]
pub struct RuntimeStatus {
    pub effective_profile_id: Option<String>,
    pub effective_provider_kind: Option<Provider>,
    pub unavailable_error: Option<String>,
}

pub struct RuntimeState {
    engine: Arc<ArcSwapOption<AgentEngine>>,
    config: Arc<ArcSwap<AppConfig>>,
    knowledge_graph: Arc<ArcSwapOption<KgGateway>>,
    skill_graph: Arc<ArcSwapOption<SkillGraphService>>,
    status: Arc<ArcSwap<RuntimeStatus>>,
    pool: Arc<SqlitePool>,
    runtime: Arc<AgentRuntime>,
    system_broker: SharedSystemBroker,
    config_path: PathBuf,
    credentials_path: PathBuf,
    /// Runtime-only override for the agent's thinking level.
    /// Shared with the engine via Arc so it survives engine swaps.
    pub thinking_level_override: Arc<RwLock<Option<ThinkingLevel>>>,
    /// Broadcast channel sender for pushing events (e.g. kanban completions) to WebSocket clients.
    pub broadcast_tx: tokio::sync::broadcast::Sender<serde_json::Value>,
}

impl RuntimeState {
    pub fn new(
        initial_config: Arc<AppConfig>,
        pool: Arc<SqlitePool>,
        runtime: Arc<AgentRuntime>,
        system_broker: SharedSystemBroker,
        config_path: PathBuf,
        credentials_path: PathBuf,
        broadcast_tx: tokio::sync::broadcast::Sender<serde_json::Value>,
    ) -> Self {
        Self {
            engine: Arc::new(ArcSwapOption::new(None)),
            config: Arc::new(ArcSwap::new(initial_config)),
            knowledge_graph: Arc::new(ArcSwapOption::new(None)),
            skill_graph: Arc::new(ArcSwapOption::new(None)),
            status: Arc::new(ArcSwap::new(Arc::new(RuntimeStatus::default()))),
            pool,
            runtime,
            system_broker,
            config_path,
            credentials_path,
            thinking_level_override: Arc::new(RwLock::new(None)),
            broadcast_tx,
        }
    }

    pub fn config(&self) -> Arc<AppConfig> {
        self.config.load_full()
    }

    pub fn engine(&self) -> Result<Arc<AgentEngine>> {
        self.engine.load_full().ok_or_else(|| {
            let status = self.status();
            AppError::Provider(status.unavailable_error.unwrap_or_else(|| {
                "execution is unavailable because no valid default profile is configured".to_owned()
            }))
        })
    }

    pub fn engine_opt(&self) -> Option<Arc<AgentEngine>> {
        self.engine.load_full()
    }

    pub fn knowledge_graph(&self) -> Option<Arc<KgGateway>> {
        self.knowledge_graph.load_full()
    }

    pub fn skill_graph(&self) -> Option<Arc<SkillGraphService>> {
        self.skill_graph.load_full()
    }

    pub fn set_skill_graph(&self, service: Arc<SkillGraphService>) {
        self.skill_graph.store(Some(service));
    }

    pub fn status(&self) -> RuntimeStatus {
        (*self.status.load_full()).clone()
    }

    pub fn engine_handle(&self) -> Arc<ArcSwapOption<AgentEngine>> {
        self.engine.clone()
    }

    pub(crate) fn pool(&self) -> Arc<SqlitePool> {
        self.pool.clone()
    }

    pub(crate) fn agent_runtime(&self) -> Arc<AgentRuntime> {
        self.runtime.clone()
    }

    pub(crate) fn system_broker(&self) -> SharedSystemBroker {
        self.system_broker.clone()
    }

    pub(crate) fn broadcast_tx(&self) -> tokio::sync::broadcast::Sender<serde_json::Value> {
        self.broadcast_tx.clone()
    }

    pub(crate) fn config_path(&self) -> &Path {
        &self.config_path
    }

    pub(crate) fn credentials_path(&self) -> &Path {
        &self.credentials_path
    }

    pub(crate) fn update_available(
        &self,
        config: Arc<AppConfig>,
        engine: Arc<AgentEngine>,
        knowledge_graph: Option<Arc<KgGateway>>,
        status: RuntimeStatus,
    ) {
        self.config.store(config);
        self.engine.store(Some(engine));
        self.knowledge_graph.store(knowledge_graph);
        self.status.store(Arc::new(status));
    }

    pub(crate) fn update_unavailable(&self, config: Arc<AppConfig>, status: RuntimeStatus) {
        self.config.store(config);
        self.engine.store(None);
        self.knowledge_graph.store(None);
        self.status.store(Arc::new(status));
    }
}
