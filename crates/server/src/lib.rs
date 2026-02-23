pub mod middleware;
pub mod routes;
pub mod state;
pub mod static_files;
pub mod ws;

use std::sync::Arc;

use axum::{routing::{get, post}, Router};
use state::AppState;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;

use rushdino_agent::{AgentConfig, AgentEngine};
use rushdino_common::{config::ProviderKind, db, init, AppConfig, CredentialsConfig, Result};
use rushdino_providers::{types::ProviderConfig, Provider};

pub async fn run_server() -> Result<()> {
    init::ensure_rushdino_dir()?;
    let config = Arc::new(AppConfig::load()?);
    let credentials = Arc::new(CredentialsConfig::load()?);

    let pool = Arc::new(db::init_pool(&config.db_path).await?);
    db::run_migrations(pool.as_ref()).await?;

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
    };

    let provider = Arc::new(Provider::from_config(&provider_config)?);
    let engine = Arc::new(AgentEngine::new(
        provider,
        pool,
        config.data_dir.clone(),
        credentials.brave_api_key.clone(),
        AgentConfig::default(),
    )?);

    let state = AppState::new(engine.clone(), config.clone());

    if credentials
        .telegram_bot_token
        .as_deref()
        .filter(|t| !t.is_empty())
        .is_some()
    {
        let tg_engine = engine;
        let tg_config = config.clone();
        let tg_credentials = credentials.clone();
        tokio::spawn(async move {
            if let Err(err) = rushdino_telegram::start_bot(tg_engine, tg_config, tg_credentials).await {
                tracing::error!("telegram bot failed: {err}");
            }
        });
    }

    let app = Router::new()
        .route("/healthz", get(routes::health::healthz))
        .route("/api/chat", post(routes::chat::chat))
        .route("/api/ws/chat", get(ws::ws_chat))
        .route("/api/conversations", get(routes::conversations::list_conversations))
        .route(
            "/api/conversations/:id",
            get(routes::conversations::get_conversation).delete(routes::conversations::delete_conversation),
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
