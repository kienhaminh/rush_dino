pub mod middleware;
pub mod routes;
pub mod state;
pub mod static_files;
pub mod webchat;
pub mod ws;

use std::sync::Arc;

use axum::{routing::{get, post}, Router};
use state::AppState;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;

use rushdino_agent::{AgentConfig, AgentEngine};
use rushdino_common::{config::ProviderKind, db, init, AppConfig, CredentialsConfig, Result};
use rushdino_gateway::Gateway;
use rushdino_providers::{types::ProviderConfig, Provider};

use crate::webchat::WebChatAdapter;

pub async fn run_server() -> Result<()> {
    init::ensure_rushdino_dir()?;
    let config = Arc::new(AppConfig::load()?);
    let credentials = Arc::new(CredentialsConfig::load()?);

    let pool = db::init_pool(&config.db_path).await?;
    db::run_migrations(&pool).await?;
    let pool = Arc::new(pool);

    let provider_config = match config.active_provider {
        ProviderKind::Ollama => ProviderConfig::Ollama {
            base_url: config.ollama.base_url.clone(),
            model: config.ollama.model.clone(),
            api_key: None,
        },
        ProviderKind::Openai => ProviderConfig::OpenAI {
            api_key: credentials.openai_api_key.clone().unwrap_or_default(),
            model: config.openai.model.clone(),
            base_url: None,
        },
        ProviderKind::Anthropic => ProviderConfig::Anthropic {
            api_key: credentials.anthropic_api_key.clone().unwrap_or_default(),
            model: config.anthropic.model.clone(),
        },
        ProviderKind::Plugin => ProviderConfig::Plugin {
            manifest_path: config.data_dir.join("plugins/default.toml"),
        },
        // Codex uses the OpenAI-compatible API with an OAuth access token.
        // Full CodexProvider wiring is handled in a dedicated task.
        ProviderKind::Codex => ProviderConfig::OpenAI {
            api_key: credentials.codex_access_token.clone().unwrap_or_default(),
            model: config.codex.model.clone(),
            base_url: None,
        },
    };

    let provider = Arc::new(Provider::from_config(&provider_config)?);
    let engine = Arc::new(AgentEngine::new(
        provider,
        pool.clone(),
        config.data_dir.clone(),
        credentials.brave_api_key.clone(),
        AgentConfig::default(),
    )?);

    // Build gateway and register all enabled channel adapters.
    let mut gateway = Gateway::new(engine.clone(), (*pool).clone());

    // Telegram
    if config.gateway.telegram.enabled {
        if let Some(token) = credentials.telegram_bot_token.as_deref().filter(|t| !t.is_empty()) {
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
        if let Some(token) =
            credentials.discord_bot_token.as_deref().filter(|t| !t.is_empty())
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

    let state = AppState::new(engine, config.clone(), webchat);

    let app = Router::new()
        .route("/healthz", get(routes::health::healthz))
        .route("/api/chat", post(routes::chat::chat))
        .route("/api/ws/chat", get(ws::ws_chat))
        .route("/api/conversations", get(routes::conversations::list_conversations))
        .route(
            "/api/conversations/:id",
            get(routes::conversations::get_conversation)
                .delete(routes::conversations::delete_conversation),
        )
        .route("/api/documents/ingest", post(routes::documents::ingest_documents))
        .fallback(get(static_files::serve_static))
        .layer(middleware::cors_layer())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!("rushdino server listening on http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|e| rushdino_common::AppError::Agent(format!("server error: {e}")))
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
