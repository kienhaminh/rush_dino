pub mod approval_gate;
mod knowledge_graph_bridge;
pub mod middleware;
pub mod routes;
pub mod state;
pub mod static_files;
pub mod webchat;
pub mod ws;

use std::{path::Path, sync::Arc};

use axum::{
    middleware as axum_middleware,
    routing::{get, patch, post},
    Router,
};
use state::AppState;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;

use rushdino_agent::{AgentConfig, AgentEngine, ToolApproval};
use rushdino_common::{config::ProviderKind, db, init, AppConfig, AppError, CredentialsConfig, Result};
use rushdino_gateway::Gateway;
use rushdino_knowledge_graph::KnowledgeGraphService;
use rushdino_providers::{codex_refresh, types::ProviderConfig, Provider};
use rushdino_security::rate_limit::EndpointLimiters;

use crate::{
    approval_gate::ApprovalGate,
    knowledge_graph_bridge::KnowledgeGraphBridge,
    middleware::{cors_layer, hmac_auth_middleware, rate_limit_middleware, HmacAuthState},
    webchat::WebChatAdapter,
};

pub async fn run_server() -> Result<()> {
    init::ensure_rushdino_dir()?;
    let home = init::default_home_dir();
    let config_path = home.join("config.toml");
    let credentials_path = home.join("credentials.toml");
    let config = Arc::new(AppConfig::load()?);
    let mut credentials = CredentialsConfig::load()?;

    let effective_provider = resolve_effective_provider(config.as_ref(), &mut credentials).await?;
    let provider_config = select_provider_config(config.as_ref(), &credentials, effective_provider.clone())?;
    if effective_provider != config.active_provider {
        tracing::warn!(
            "provider: falling back from {:?} to {:?}",
            config.active_provider,
            effective_provider
        );
    }

    let pool = db::init_pool(&config.db_path).await?;
    db::run_migrations(&pool).await?;
    let pool = Arc::new(pool);

    let provider = Arc::new(Provider::from_config(&provider_config)?);
    let knowledge_graph_service = if config.knowledge_graph.enabled {
        Some(Arc::new(KnowledgeGraphService::new(
            (*pool).clone(),
            provider.clone(),
            config.knowledge_graph.clone(),
            config.data_dir.clone(),
        )))
    } else {
        None
    };

    let knowledge_graph_bridge = knowledge_graph_service
        .as_ref()
        .map(|service| Arc::new(KnowledgeGraphBridge::new(service.clone())) as Arc<dyn rushdino_agent::KnowledgeGraphAccess>);
    let gate = ApprovalGate::new();
    let engine = Arc::new(AgentEngine::new(
        provider,
        pool.clone(),
        config.data_dir.clone(),
        credentials.brave_api_key.clone(),
        AgentConfig::default(),
        Some(gate.clone() as Arc<dyn ToolApproval>),
        knowledge_graph_bridge,
    )?);

    let credentials = Arc::new(credentials);

    // Build gateway and register all enabled channel adapters.
    let mut gateway = Gateway::new(engine.clone(), (*pool).clone());

    // Telegram
    if config.gateway.telegram.enabled {
        if let Some(token) = credentials
            .telegram_bot_token
            .as_deref()
            .filter(|t| !t.is_empty())
        {
            gateway.register(rushdino_telegram::TelegramAdapter::new(
                token.to_owned(),
                config.clone(),
            ));
            tracing::info!("gateway: telegram adapter registered");
        } else {
            tracing::warn!("gateway: telegram enabled but token missing");
        }
    }

    // Discord
    if config.gateway.discord.enabled {
        if let Some(token) = credentials
            .discord_bot_token
            .as_deref()
            .filter(|t| !t.is_empty())
        {
            gateway.register(rushdino_discord::DiscordAdapter::new(token));
            tracing::info!("gateway: discord adapter registered");
        } else {
            tracing::warn!("gateway: discord enabled but token missing");
        }
    }

    // Slack
    if config.gateway.slack.enabled {
        let bot = credentials.slack_bot_token.as_deref().unwrap_or("").to_owned();
        let app = credentials.slack_app_token.as_deref().unwrap_or("").to_owned();
        if !bot.is_empty() && !app.is_empty() {
            gateway.register(rushdino_slack::SlackAdapter::new(bot, app));
            tracing::info!("gateway: slack adapter registered");
        } else {
            tracing::warn!("gateway: slack enabled but tokens missing");
        }
    }

    // WebChat (always on — drives the axum WebSocket route)
    let webchat = Arc::new(WebChatAdapter::new());
    if config.gateway.webchat.enabled {
        gateway.register_arc(webchat.clone() as Arc<dyn rushdino_gateway::ChannelAdapter>);
        tracing::info!("gateway: webchat adapter registered");
    }

    // Spawn the gateway in a background task.
    tokio::spawn(async move {
        if let Err(err) = gateway.start().await {
            tracing::error!("gateway exited with error: {err}");
        }
    });

    // Build optional HMAC auth state from CredentialsConfig
    let hmac_auth = if config.security.hmac_auth_enabled {
        if let Some(secret) = credentials.api_secret.as_deref().filter(|s| !s.is_empty()) {
            let secret_bytes = hex::decode(secret).unwrap_or_else(|_| secret.as_bytes().to_vec());
            tracing::info!("security: HMAC-SHA256 authentication enabled");
            Some(Arc::new(HmacAuthState::new(secret_bytes)))
        } else {
            tracing::warn!("security: hmac_auth_enabled=true but no api_secret configured; auth disabled");
            None
        }
    } else {
        None
    };

    // Always enable rate limiting
    let rate_limiters = Some(Arc::new(EndpointLimiters::new()));

    if let Some(kg) = &knowledge_graph_service {
        if config.knowledge_graph.backfill_on_startup {
            let kg = kg.clone();
            tokio::spawn(async move {
                if let Err(err) = kg.run_backfill().await {
                    tracing::warn!("knowledge graph startup backfill failed: {err}");
                }
            });
        }
    }

    let state = AppState::new(
        engine,
        config.clone(),
        config_path,
        credentials_path,
        webchat,
        gate,
        hmac_auth,
        rate_limiters,
        knowledge_graph_service.clone(),
    );

    let app = Router::new()
        .route("/healthz", get(routes::health::healthz))
        .route("/api/chat", post(routes::chat::chat))
        .route("/api/ws/chat", get(ws::ws_chat))
        .route("/api/conversations", get(routes::conversations::list_conversations))
        .route("/api/agents", get(routes::agents::list_agents))
        .route("/api/agents/progress", get(routes::agent_progress::get_agent_progress))
        .route("/api/agents/:id/runtime", get(routes::agents::get_agent_runtime))
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
        .route("/api/documents/ingest", post(routes::documents::ingest_documents))
        .route("/api/graph/search", get(routes::graph::search))
        .route("/api/graph/facts", get(routes::graph::facts))
        .route("/api/graph/node/:id", get(routes::graph::node))
        .route("/api/graph/stats", get(routes::graph::stats))
        .route("/api/graph/backfill", post(routes::graph::backfill))
        .route("/api/approval/:request_id", get(routes::approval::get_approval_status))
        .route("/api/approval/:request_id", post(routes::approval::resolve_approval))
        .route(
            "/api/config",
            get(routes::config::get_config).patch(routes::config::patch_config),
        )
        .route(
            "/api/credentials",
            get(routes::config::get_credentials).patch(routes::config::patch_credentials),
        )
        .fallback(get(static_files::serve_static))
        .layer(axum_middleware::from_fn_with_state(state.clone(), rate_limit_middleware))
        .layer(axum_middleware::from_fn_with_state(state.clone(), hmac_auth_middleware))
        .layer(cors_layer(&config))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!("rushdino server listening on http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|e| AppError::Agent(format!("server error: {e}")))
}

async fn resolve_effective_provider(
    config: &AppConfig,
    credentials: &mut CredentialsConfig,
) -> Result<ProviderKind> {
    if config.active_provider != ProviderKind::Codex {
        return Ok(config.active_provider.clone());
    }

    let access_token = credentials.codex_access_token.as_deref().unwrap_or("");
    let refresh_token = credentials.codex_refresh_token.as_deref().unwrap_or("");
    let needs_refresh =
        access_token.is_empty() || codex_refresh::token_needs_refresh(credentials.codex_token_expires_at);

    if !needs_refresh {
        return Ok(ProviderKind::Codex);
    }

    if refresh_token.is_empty() {
        tracing::warn!("codex: refresh token missing while token is stale");
        return fallback_provider_on_codex_failure(config, credentials, "refresh token missing");
    }

    tracing::info!("codex: access token stale, refreshing");
    match codex_refresh::refresh_codex_token(refresh_token).await {
        Ok((new_access, new_refresh, new_expires_at)) => {
            let credentials_path = init::default_home_dir().join("credentials.toml");
            persist_refreshed_codex_tokens(
                credentials,
                &credentials_path,
                new_access,
                new_refresh,
                new_expires_at,
            )?;
            tracing::info!("codex: token refresh succeeded");
            Ok(ProviderKind::Codex)
        }
        Err(err) => {
            tracing::warn!("codex: token refresh failed: {err}");
            fallback_provider_on_codex_failure(config, credentials, "refresh failed")
        }
    }
}

fn persist_refreshed_codex_tokens(
    credentials: &mut CredentialsConfig,
    path: &Path,
    access_token: String,
    refresh_token: String,
    expires_at: i64,
) -> Result<()> {
    credentials.codex_access_token = Some(access_token);
    credentials.codex_refresh_token = Some(refresh_token);
    credentials.codex_token_expires_at = Some(expires_at);
    credentials.save_to_path(path)?;
    Ok(())
}

fn fallback_provider_on_codex_failure(
    config: &AppConfig,
    credentials: &CredentialsConfig,
    reason: &str,
) -> Result<ProviderKind> {
    let fallback = config.codex_fallback_provider.clone().ok_or_else(|| {
        AppError::Provider(format!(
            "codex provider cannot start ({reason}) and codex_fallback_provider is not configured"
        ))
    })?;
    if fallback == ProviderKind::Codex {
        return Err(AppError::Provider(
            "codex_fallback_provider cannot be codex".to_owned(),
        ));
    }
    // Validation: fallback must be fully configured before we switch.
    let _ = select_provider_config(config, credentials, fallback.clone())?;
    Ok(fallback)
}

fn select_provider_config(
    config: &AppConfig,
    credentials: &CredentialsConfig,
    provider: ProviderKind,
) -> Result<ProviderConfig> {
    match provider {
        ProviderKind::Ollama => {
            if config.ollama.base_url.trim().is_empty() || config.ollama.model.trim().is_empty() {
                return Err(AppError::Provider(
                    "ollama fallback requires non-empty base_url and model".to_owned(),
                ));
            }
            Ok(ProviderConfig::Ollama {
                base_url: config.ollama.base_url.clone(),
                model: config.ollama.model.clone(),
                api_key: None,
            })
        }
        ProviderKind::Openai => {
            let api_key = credentials.openai_api_key.clone().unwrap_or_default();
            if api_key.trim().is_empty() {
                return Err(AppError::Provider(
                    "openai provider requires openai_api_key".to_owned(),
                ));
            }
            Ok(ProviderConfig::OpenAI {
                api_key,
                model: config.openai.model.clone(),
                base_url: None,
            })
        }
        ProviderKind::Anthropic => {
            let api_key = credentials.anthropic_api_key.clone().unwrap_or_default();
            if api_key.trim().is_empty() {
                return Err(AppError::Provider(
                    "anthropic provider requires anthropic_api_key".to_owned(),
                ));
            }
            Ok(ProviderConfig::Anthropic {
                api_key,
                model: config.anthropic.model.clone(),
            })
        }
        ProviderKind::Plugin => {
            let manifest_path = config.data_dir.join("plugins/default.toml");
            if !manifest_path.exists() {
                return Err(AppError::Provider(format!(
                    "plugin provider requires manifest at {}",
                    manifest_path.display()
                )));
            }
            Ok(ProviderConfig::Plugin { manifest_path })
        }
        ProviderKind::Codex => {
            let access_token = credentials.codex_access_token.clone().unwrap_or_default();
            if access_token.trim().is_empty() {
                return Err(AppError::Provider(
                    "codex provider requires codex_access_token".to_owned(),
                ));
            }
            Ok(ProviderConfig::Codex {
                access_token,
                model: config.codex.model.clone(),
            })
        }
    }
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
    use std::fs;

    use rushdino_common::{init, ProviderKind};

    use super::{
        fallback_provider_on_codex_failure, persist_refreshed_codex_tokens, select_provider_config,
    };

    #[test]
    fn fallback_requires_configuration() {
        let mut config = rushdino_common::AppConfig::default();
        config.active_provider = ProviderKind::Codex;
        config.codex_fallback_provider = None;
        let credentials = rushdino_common::CredentialsConfig::default();

        assert!(fallback_provider_on_codex_failure(&config, &credentials, "refresh failed").is_err());
    }

    #[test]
    fn fallback_cannot_be_codex() {
        let mut config = rushdino_common::AppConfig::default();
        config.active_provider = ProviderKind::Codex;
        config.codex_fallback_provider = Some(ProviderKind::Codex);
        let credentials = rushdino_common::CredentialsConfig::default();

        assert!(fallback_provider_on_codex_failure(&config, &credentials, "refresh failed").is_err());
    }

    #[test]
    fn fallback_to_openai_requires_key() {
        let mut config = rushdino_common::AppConfig::default();
        config.active_provider = ProviderKind::Codex;
        config.codex_fallback_provider = Some(ProviderKind::Openai);
        let credentials = rushdino_common::CredentialsConfig::default();

        assert!(fallback_provider_on_codex_failure(&config, &credentials, "refresh failed").is_err());
    }

    #[test]
    fn fallback_to_openai_selects_provider_when_valid() {
        let mut config = rushdino_common::AppConfig::default();
        config.active_provider = ProviderKind::Codex;
        config.codex_fallback_provider = Some(ProviderKind::Openai);
        let credentials = rushdino_common::CredentialsConfig {
            openai_api_key: Some("sk-test".to_owned()),
            ..rushdino_common::CredentialsConfig::default()
        };

        let selected =
            fallback_provider_on_codex_failure(&config, &credentials, "refresh failed")
                .expect("fallback should be selected");
        assert_eq!(selected, ProviderKind::Openai);
    }

    #[test]
    fn codex_refresh_persistence_updates_memory_and_disk() {
        let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
        init::ensure_rushdino_dir_at(&root).expect("init test root");
        let path = root.join("credentials.toml");
        let mut credentials = rushdino_common::CredentialsConfig::default();

        persist_refreshed_codex_tokens(
            &mut credentials,
            &path,
            "access-new".to_owned(),
            "refresh-new".to_owned(),
            1_760_000_000,
        )
        .expect("refresh persistence should succeed");

        let reloaded =
            rushdino_common::CredentialsConfig::load_from_path(&path).expect("reload credentials");
        assert_eq!(credentials.codex_access_token, Some("access-new".to_owned()));
        assert_eq!(reloaded.codex_access_token, Some("access-new".to_owned()));
        assert_eq!(reloaded.codex_refresh_token, Some("refresh-new".to_owned()));
        assert_eq!(reloaded.codex_token_expires_at, Some(1_760_000_000));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn select_provider_rejects_missing_plugin_manifest() {
        let mut config = rushdino_common::AppConfig::default();
        config.data_dir = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
        let credentials = rushdino_common::CredentialsConfig::default();
        assert!(select_provider_config(&config, &credentials, ProviderKind::Plugin).is_err());
    }
}
