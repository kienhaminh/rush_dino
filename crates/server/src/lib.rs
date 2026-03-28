pub mod approval_gate;
pub mod policy_system_broker;
pub mod channel_pairing;
mod chat_broadcast;
mod cron_runtime;
mod knowledge_graph_bridge;
pub mod middleware;
mod provider_runtime;
pub mod routes;
mod runtime_log_store;
mod runtime_state;
pub mod state;
pub mod static_files;
mod system_broker;
pub mod webchat;
pub mod ws;

use std::sync::Arc;

use sqlx::SqlitePool;

use axum::{
    middleware as axum_middleware,
    routing::{get, patch, post},
    Router,
};
use state::AppState;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;

use rushdino_agent::AgentRuntime;
use rushdino_common::{asset_sync, db, init, AppConfig, AppError, CredentialsConfig, Result};
use rushdino_gateway::{
    Gateway, GatewayAdapterCapabilities, GatewayRichDeliveryMode, GatewayStateStore, SessionManager,
};
use rushdino_security::rate_limit::EndpointLimiters;

use crate::{
    approval_gate::ApprovalGate,
    channel_pairing::{ChannelPairingIngressPolicy, ChannelPairingService},
    chat_broadcast::{ChatBroadcastHub, GatewayChatObserver},
    cron_runtime::spawn_cron_runtime,
    middleware::{
        cors_layer, dashboard_auth_middleware, hmac_auth_middleware, rate_limit_middleware,
        HmacAuthState,
    },
    provider_runtime::refresh_runtime_from_disk,
    runtime_log_store::RuntimeLogStore,
    runtime_state::RuntimeState,
    system_broker::LocalSystemBroker,
    webchat::WebChatAdapter,
};

/// Build the Axum application router with all state wired up.
pub async fn build_app(
    config: Arc<AppConfig>,
    credentials: Arc<CredentialsConfig>,
    config_path: std::path::PathBuf,
    credentials_path: std::path::PathBuf,
    pool: Arc<SqlitePool>,
) -> Result<Router> {
    let chat_broadcast = Arc::new(ChatBroadcastHub::new());
    let runtime_logs = Arc::new(RuntimeLogStore::new(
        pool.clone(),
        Some(chat_broadcast.clone()),
    ));
    let gate = ApprovalGate::new();
    let runtime = Arc::new(AgentRuntime::new(pool.clone()));
    runtime.reconcile_incomplete_runs().await?;
    let system_broker = Arc::new(LocalSystemBroker::new(gate.clone(), runtime.clone()))
        as rushdino_agent::SharedSystemBroker;
    let runtime_state = Arc::new(RuntimeState::new(
        config.clone(),
        pool.clone(),
        runtime.clone(),
        system_broker.clone(),
        config_path.clone(),
        credentials_path.clone(),
        chat_broadcast.sender(),
    ));

    spawn_cron_runtime(runtime_state.clone());

    let runtime_state_bg = runtime_state.clone();
    let runtime_logs_bg = runtime_logs.clone();
    tokio::spawn(async move {
        if let Err(err) = refresh_runtime_from_disk(runtime_state_bg.as_ref()).await {
            tracing::error!("failed to perform initial runtime refresh: {err}");
        }
        if let Some(unavailable_error) = runtime_state_bg.status().unavailable_error.clone() {
            let _ = log_runtime(
                &runtime_logs_bg,
                "warn",
                "provider",
                "default profile runtime unavailable",
                Some(serde_json::json!({ "error": unavailable_error })),
            )
            .await;
        }
        if let Some(engine) = runtime_state_bg.engine_opt() {
            engine.seed_initial_workflows().await;
            engine.ensure_main_session().await.ok();
        }
    });

    let gateway_state = Arc::new(GatewayStateStore::new());
    let channel_pairing = Arc::new(ChannelPairingService::new((*pool).clone()));
    let dashboard_auth = Arc::new(rushdino_common::dashboard_auth::DashboardAuthService::new(
        (*pool).clone(),
    ));
    let ingress_policy = Arc::new(ChannelPairingIngressPolicy::new(
        config_path.clone(),
        channel_pairing.clone(),
        runtime_logs.clone(),
    ));
    gateway_state
        .seed_channel(
            "telegram",
            config.gateway.telegram.enabled,
            gateway_adapter_capabilities("telegram"),
        )
        .await;
    gateway_state
        .seed_channel(
            "discord",
            config.gateway.discord.enabled,
            gateway_adapter_capabilities("discord"),
        )
        .await;
    gateway_state
        .seed_channel(
            "slack",
            config.gateway.slack.enabled,
            gateway_adapter_capabilities("slack"),
        )
        .await;
    gateway_state
        .seed_channel(
            "webchat",
            config.gateway.webchat.enabled,
            gateway_adapter_capabilities("webchat"),
        )
        .await;
    let gateway_sessions = Arc::new(SessionManager::new((*pool).clone()));

    // Build gateway and register all enabled channel adapters.
    let mut gateway = Gateway::new(
        runtime_state.engine_handle(),
        gateway_sessions.clone(),
        gateway_state.clone(),
        Some(Arc::new(GatewayChatObserver::new(chat_broadcast.clone()))),
        Some(ingress_policy),
    );

    // Telegram
    if config.gateway.telegram.enabled {
        if should_register_gateway_adapter("telegram", config.as_ref(), credentials.as_ref()) {
            let token = credentials
                .telegram_bot_token
                .as_deref()
                .expect("telegram token checked by should_register_gateway_adapter");
            gateway.register(rushdino_telegram::TelegramAdapter::new(
                token.to_owned(),
                config.clone(),
            ));
            tracing::info!("gateway: telegram adapter registered");
            let _ = log_runtime(
                &runtime_logs,
                "info",
                "gateway.telegram",
                "telegram adapter registered",
                None,
            )
            .await;
        } else {
            tracing::warn!("gateway: telegram enabled but token missing");
            gateway_state
                .reporter("telegram")
                .degraded("telegram enabled but token missing")
                .await;
            let _ = log_runtime(
                &runtime_logs,
                "warn",
                "gateway.telegram",
                "telegram enabled but token missing",
                None,
            )
            .await;
        }
    }

    // Discord
    if config.gateway.discord.enabled {
        if should_register_gateway_adapter("discord", config.as_ref(), credentials.as_ref()) {
            let token = credentials
                .discord_bot_token
                .as_deref()
                .expect("discord token checked by should_register_gateway_adapter");
            gateway.register(rushdino_discord::DiscordAdapter::new(token));
            tracing::info!("gateway: discord adapter registered");
            let _ = log_runtime(
                &runtime_logs,
                "info",
                "gateway.discord",
                "discord adapter registered",
                None,
            )
            .await;
        } else {
            tracing::warn!("gateway: discord enabled but token missing");
            gateway_state
                .reporter("discord")
                .degraded("discord enabled but token missing")
                .await;
            let _ = log_runtime(
                &runtime_logs,
                "warn",
                "gateway.discord",
                "discord enabled but token missing",
                None,
            )
            .await;
        }
    }

    // Slack
    if config.gateway.slack.enabled {
        if should_register_gateway_adapter("slack", config.as_ref(), credentials.as_ref()) {
            let bot = credentials
                .slack_bot_token
                .as_deref()
                .expect("slack bot token checked by should_register_gateway_adapter")
                .to_owned();
            let app = credentials
                .slack_app_token
                .as_deref()
                .expect("slack app token checked by should_register_gateway_adapter")
                .to_owned();
            gateway.register(rushdino_slack::SlackAdapter::new(bot, app));
            tracing::info!("gateway: slack adapter registered");
            let _ = log_runtime(
                &runtime_logs,
                "info",
                "gateway.slack",
                "slack adapter registered",
                None,
            )
            .await;
        } else {
            tracing::warn!("gateway: slack enabled but tokens missing");
            gateway_state
                .reporter("slack")
                .degraded("slack enabled but tokens missing")
                .await;
            let _ = log_runtime(
                &runtime_logs,
                "warn",
                "gateway.slack",
                "slack enabled but tokens missing",
                None,
            )
            .await;
        }
    }

    // WebChat (always on — drives the axum WebSocket route)
    let webchat = Arc::new(WebChatAdapter::new());
    if config.gateway.webchat.enabled {
        gateway.register_arc(webchat.clone() as Arc<dyn rushdino_gateway::ChannelAdapter>);
        tracing::info!("gateway: webchat adapter registered");
        let _ = log_runtime(
            &runtime_logs,
            "info",
            "gateway.webchat",
            "webchat adapter registered",
            None,
        )
        .await;
    }

    let gateway_control = gateway.start().await?;

    // Build optional HMAC auth state from CredentialsConfig
    let hmac_auth = if config.security.hmac_auth_enabled {
        if let Some(secret) = credentials.api_secret.as_deref().filter(|s| !s.is_empty()) {
            let secret_bytes = hex::decode(secret).unwrap_or_else(|_| secret.as_bytes().to_vec());
            tracing::info!("security: HMAC-SHA256 authentication enabled");
            Some(Arc::new(HmacAuthState::new(secret_bytes)))
        } else {
            tracing::warn!(
                "security: hmac_auth_enabled=true but no api_secret configured; auth disabled"
            );
            None
        }
    } else {
        None
    };

    // Always enable rate limiting
    let rate_limiters = Some(Arc::new(EndpointLimiters::new()));

    if config.knowledge_graph.backfill_on_startup {
        if let Some(kg) = runtime_state.knowledge_graph() {
            tokio::spawn(async move {
                if let Err(err) = kg.run_backfill().await {
                    tracing::warn!("knowledge graph startup backfill failed: {err}");
                }
            });
        }
    }

    // Build the sandbox registry using the shared SQLite pool and agents dir.
    let agents_dir = config.data_dir.join("agents");
    let sandbox_registry = state::SandboxRegistry::new(pool.clone(), agents_dir);
    let pending_oauth = state::PendingOAuthStore::new();

    // Skill graph: keyword-based routing for skill selection
    let skill_graph_service = Arc::new(rushdino_skill_graph::SkillGraphService::new((*pool).clone()));
    if let Err(err) = skill_graph_service.ensure_seeded().await {
        tracing::warn!("skill graph seeding failed: {err}");
    }
    runtime_state.set_skill_graph(skill_graph_service.clone());

    let state = AppState::new(
        runtime_state.clone(),
        config_path,
        credentials_path,
        webchat,
        gate,
        gateway_state,
        gateway_sessions,
        gateway_control,
        hmac_auth,
        rate_limiters,
        runtime_logs.clone(),
        chat_broadcast,
        channel_pairing,
        dashboard_auth,
        sandbox_registry,
        pending_oauth,
        skill_graph_service,
    );
    let app = Router::new()
        .route("/healthz", get(routes::health::healthz))
        .route(
            "/api/dashboard-auth/status",
            get(routes::dashboard_auth::get_status),
        )
        .route(
            "/api/dashboard-auth/exchange",
            post(routes::dashboard_auth::exchange),
        )
        .route(
            "/api/dashboard-auth/logout",
            post(routes::dashboard_auth::logout),
        )
        .route("/api/chat", post(routes::chat::chat))
        .route("/api/ws/chat", get(ws::ws_chat))
        .route(
            "/api/conversations",
            get(routes::conversations::list_conversations),
        )
        .route(
            "/api/sessions",
            get(routes::sessions::list_sessions).post(routes::sessions::create_session),
        )
        .route("/api/agent-sessions", get(routes::sessions::list_agent_sessions))
        .route(
            "/api/sessions/:id",
            get(routes::sessions::get_session).delete(routes::sessions::delete_session),
        )
        .route(
            "/api/sessions/:id/messages",
            post(routes::sessions::send_session_message),
        )
        .route(
            "/api/sessions/:id/reset",
            post(routes::sessions::reset_session),
        )
        .route(
            "/api/sessions/:id/archive",
            post(routes::sessions::archive_session),
        )
        .route(
            "/api/sessions/:id/runs",
            get(routes::runs::list_session_runs),
        )
        .route(
            "/api/cron",
            get(routes::cron::list_cron_jobs).post(routes::cron::create_cron_job),
        )
        .route(
            "/api/cron/:id",
            get(routes::cron::get_cron_job)
                .patch(routes::cron::update_cron_job)
                .delete(routes::cron::delete_cron_job),
        )
        .route("/api/cron/:id/pause", post(routes::cron::pause_cron_job))
        .route("/api/cron/:id/resume", post(routes::cron::resume_cron_job))
        .route("/api/cron/:id/run", post(routes::cron::run_cron_job))
        .route("/api/cron/:id/runs", get(routes::cron::list_cron_runs))
        .route("/api/logs", get(routes::logs::get_logs))
        .route("/api/approvals", get(routes::approval::list_approvals))
        .route(
            "/api/channels/:channel/pairing",
            get(routes::channel_pairing::get_channel_pairing),
        )
        .route(
            "/api/channels/:channel/pairing/:request_id/decision",
            post(routes::channel_pairing::resolve_channel_pairing_request),
        )
        .route(
            "/api/channels/:channel/pairing/paired/:sender_id",
            axum::routing::delete(routes::channel_pairing::revoke_paired_sender),
        )
        .route(
            "/api/gateway/summary",
            get(routes::gateway::get_gateway_summary),
        )
        .route(
            "/api/gateway/adapters",
            get(routes::gateway::list_gateway_adapters),
        )
        .route(
            "/api/gateway/sessions",
            get(routes::gateway::list_gateway_sessions),
        )
        .route(
            "/api/gateway/adapters/:channel/restart",
            post(routes::gateway::restart_gateway_adapter),
        )
        .route(
            "/api/gateway/sessions/:id/reset",
            post(routes::gateway::reset_gateway_session),
        )
        .route("/api/files", post(routes::files::mutate_file))
        .route(
            "/api/runs",
            get(routes::runs::list_runs).post(routes::runs::create_run),
        )
        .route("/api/runs/:id", get(routes::runs::get_run))
        .route("/api/runs/:id/abort", post(routes::runs::abort_run))
        .route("/api/runs/:id/wait", get(routes::runs::wait_for_run))
        .route(
            "/api/system/summary",
            get(routes::system::get_system_summary),
        )
        .route("/api/system/doctor", get(routes::system::get_doctor_report))
        .route(
            "/api/system/thinking-level",
            patch(routes::system::patch_thinking_level),
        )
        .route(
            "/api/system/soul-memory",
            get(routes::soul_memory::get_soul_memory_state),
        )
        .route(
            "/api/system/soul-memory/file",
            patch(routes::soul_memory::patch_core_file),
        )
        .route(
            "/api/system/prompt",
            get(routes::soul_memory::get_system_prompt),
        )
        .route(
            "/api/system/tools",
            get(routes::soul_memory::get_registered_tools),
        )
        .route(
            "/api/usage/metrics",
            get(routes::usage_metrics::get_usage_metrics),
        )
        .route("/api/agents", get(routes::agents::list_agents))
        .route(
            "/api/agents/progress",
            get(routes::agent_progress::get_agent_progress),
        )
        .route(
            "/api/agents/:id",
            axum::routing::delete(routes::agents::delete_agent),
        )
        .route(
            "/api/agents/:id/runtime",
            get(routes::agents::get_agent_runtime),
        )
        .route(
            "/api/agents/:id/files/:filename",
            patch(routes::agents::update_agent_file),
        )
        .route(
            "/api/workflows",
            get(routes::workflows::list_workflows).post(routes::workflows::create_workflow),
        )
        .route(
            "/api/workflows/:id",
            get(routes::workflows::get_workflow)
                .patch(routes::workflows::update_workflow)
                .delete(routes::workflows::delete_workflow),
        )
        .route(
            "/api/workflows/:id/runs",
            get(routes::workflows::list_workflow_runs).post(routes::workflows::start_workflow_run),
        )
        .route(
            "/api/workflow-runs/:run_id",
            get(routes::workflows::get_workflow_run),
        )
        .route(
            "/api/conversations/:id",
            get(routes::conversations::get_conversation)
                .delete(routes::conversations::delete_conversation),
        )
        .route(
            "/api/documents/ingest",
            post(routes::documents::ingest_documents),
        )
        // Kanban task board
        .route("/api/kanban/board", get(routes::kanban::get_kanban_board))
        .route("/api/kanban/tasks", get(routes::kanban::list_kanban_tasks))
        .route("/api/kanban/tasks/:id", get(routes::kanban::get_kanban_task).delete(routes::kanban::delete_kanban_task))
        .route("/api/kanban/stats", get(routes::kanban::get_kanban_stats))
        .route("/api/graph/search", get(routes::graph::search))
        .route("/api/graph/facts", get(routes::graph::facts))
        .route("/api/graph/node/:id", get(routes::graph::node))
        .route("/api/graph/stats", get(routes::graph::stats))
        .route("/api/graph/backfill", post(routes::graph::backfill))
        .route(
            "/api/approval/:request_id",
            get(routes::approval::get_approval_status),
        )
        .route(
            "/api/approval/:request_id",
            post(routes::approval::resolve_approval),
        )
        .route(
            "/api/config",
            get(routes::config::get_config).patch(routes::config::patch_config),
        )
        .route(
            "/api/credentials",
            get(routes::config::get_credentials).patch(routes::config::patch_credentials),
        )
        .route(
            "/api/profiles",
            get(routes::providers::list_profiles).post(routes::providers::create_profile),
        )
        .route(
            "/api/skills",
            get(routes::skills::list_skills).post(routes::skills::upsert_skill),
        )
        .route(
            "/api/skills/:name",
            axum::routing::delete(routes::skills::delete_skill),
        )
        // Skill graph routing
        .route("/api/skill-graph", get(routes::skill_graph::get_graph))
        .route("/api/skill-graph/query", get(routes::skill_graph::query_skills))
        .route("/api/skill-graph/nodes", post(routes::skill_graph::upsert_node))
        .route("/api/skill-graph/nodes/:id", axum::routing::delete(routes::skill_graph::delete_node))
        .route("/api/skill-graph/edges", post(routes::skill_graph::upsert_edge))
        .route("/api/skill-graph/edges/:id", axum::routing::delete(routes::skill_graph::delete_edge))
        .route("/api/skill-graph/assign", post(routes::skill_graph::assign_category))
        .route("/api/skill-graph/reseed", post(routes::skill_graph::reseed))
        .route(
            "/api/profiles/:id",
            axum::routing::put(routes::providers::update_profile)
                .delete(routes::providers::delete_profile),
        )
        .route(
            "/api/providers/:profile_id/models",
            get(routes::providers::list_provider_models),
        )
        .route(
            "/api/providers/:profile_id/connect-oauth/start",
            post(routes::providers::connect_profile_oauth_start),
        )
        .route(
            "/api/providers/:profile_id/connect-oauth/complete",
            post(routes::providers::connect_profile_oauth_complete),
        )
        // Sandbox policy API routes
        .route(
            "/api/agents/:agent_id/sandbox",
            get(routes::sandbox::get_agent_sandbox).put(routes::sandbox::put_agent_sandbox),
        )
        .route(
            "/api/sessions/:session_id/sandbox/network",
            patch(routes::sandbox::patch_session_network_policy),
        )
        .route(
            "/api/sessions/:session_id/audit-log",
            get(routes::sandbox::get_session_audit_log),
        )
        .route(
            "/api/sessions/:session_id/sandbox/approve",
            post(routes::sandbox::approve_session_request),
        )
        .route(
            "/api/sessions/:session_id/sandbox/deny",
            post(routes::sandbox::deny_session_request),
        )
        .fallback(get(static_files::serve_static))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            rate_limit_middleware,
        ))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            dashboard_auth_middleware,
        ))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            hmac_auth_middleware,
        ))
        .layer(cors_layer(&config))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    Ok(app)
}

pub async fn run_server() -> Result<()> {
    init::ensure_rushdino_dir()?;

    let home = init::default_home_dir();
    let config_path = home.join("config.toml");
    let credentials_path = home.join("credentials.toml");
    let config = Arc::new(AppConfig::load_and_reconcile()?);
    let credentials = Arc::new(CredentialsConfig::load()?);

    let pool = Arc::new(db::init_pool(&config.db_path).await?);
    db::run_migrations(pool.as_ref()).await?;

    let app = build_app(config.clone(), credentials, config_path, credentials_path, pool).await?;

    let addr = format!("{}:{}", config.host, config.port);
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!("rushdino server listening on http://{addr}");

    let asset_home = init::default_home_dir();
    tokio::spawn(async move {
        if let Err(e) = asset_sync::seed_bundled_assets(&asset_home).await {
            tracing::warn!("asset_sync failed: {e}");
        }
    });

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|e| AppError::Agent(format!("server error: {e}")))
}

async fn log_runtime(
    store: &RuntimeLogStore,
    level: &str,
    target: &str,
    message: &str,
    fields: Option<serde_json::Value>,
) -> Result<()> {
    store.insert(level, target, message, fields).await
}

fn gateway_adapter_capabilities(channel_id: &str) -> GatewayAdapterCapabilities {
    match channel_id {
        "telegram" | "discord" | "slack" => GatewayAdapterCapabilities {
            plain_text: true,
            markdown: true,
            code_blocks: true,
            images: GatewayRichDeliveryMode::Native,
            link_buttons: GatewayRichDeliveryMode::Native,
        },
        "webchat" => GatewayAdapterCapabilities {
            plain_text: true,
            markdown: true,
            code_blocks: true,
            images: GatewayRichDeliveryMode::Degraded,
            link_buttons: GatewayRichDeliveryMode::Degraded,
        },
        _ => GatewayAdapterCapabilities::plain_text_only(),
    }
}

fn should_register_gateway_adapter(
    channel_id: &str,
    config: &AppConfig,
    credentials: &CredentialsConfig,
) -> bool {
    match channel_id {
        "telegram" => {
            config.gateway.telegram.enabled
                && credentials
                    .telegram_bot_token
                    .as_deref()
                    .is_some_and(|token| !token.trim().is_empty())
        }
        "discord" => {
            config.gateway.discord.enabled
                && credentials
                    .discord_bot_token
                    .as_deref()
                    .is_some_and(|token| !token.trim().is_empty())
        }
        "slack" => {
            config.gateway.slack.enabled
                && credentials
                    .slack_bot_token
                    .as_deref()
                    .is_some_and(|token| !token.trim().is_empty())
                && credentials
                    .slack_app_token
                    .as_deref()
                    .is_some_and(|token| !token.trim().is_empty())
        }
        "webchat" => config.gateway.webchat.enabled,
        _ => false,
    }
}

pub async fn refresh_engine_provider(state: &AppState) -> Result<()> {
    refresh_runtime_from_disk(state.runtime.as_ref()).await
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{signal, SignalKind};
        if let Ok(mut sigterm) = signal(SignalKind::terminate()) {
            sigterm.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

#[cfg(test)]
mod tests {
    use rushdino_common::CredentialsConfig;

    use super::should_register_gateway_adapter;

    #[test]
    fn telegram_adapter_registration_requires_token_at_startup() {
        let mut config = rushdino_common::AppConfig::default();
        config.gateway.telegram.enabled = true;

        assert!(!should_register_gateway_adapter(
            "telegram",
            &config,
            &CredentialsConfig::default(),
        ));

        assert!(should_register_gateway_adapter(
            "telegram",
            &config,
            &CredentialsConfig {
                telegram_bot_token: Some("123456:abc".to_owned()),
                ..CredentialsConfig::default()
            },
        ));
    }

    #[test]
    fn telegram_adapter_registration_rejects_blank_token() {
        let mut config = rushdino_common::AppConfig::default();
        config.gateway.telegram.enabled = true;

        assert!(!should_register_gateway_adapter(
            "telegram",
            &config,
            &CredentialsConfig {
                telegram_bot_token: Some("   ".to_owned()),
                ..CredentialsConfig::default()
            },
        ));
    }
}
