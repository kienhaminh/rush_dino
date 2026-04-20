use std::{path::Path, sync::Arc, time::Duration};

use axum::Router;
use futures::{SinkExt, StreamExt};
use reqwest::StatusCode;
use rushdino_common::{
    config::{AuthMethod, Provider, ProviderProfile},
    db, init, AppConfig, CredentialsConfig,
};
use rushdino_server::build_app;
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio_tungstenite::{connect_async, tungstenite::Message};

async fn create_test_app(home: &Path) -> Router {
    init::ensure_rushdino_dir_at(home).expect("create rushdino home");
    std::fs::write(
        home.join("agents").join("software-engineer.md"),
        "---\nname: software-engineer\ndescription: Offline websocket smoke agent\n---\n\nYou are the offline websocket smoke-test agent.\n",
    )
    .expect("seed default workflow agent");

    let config_path = home.join("config.toml");
    let credentials_path = home.join("credentials.toml");

    let mut config = AppConfig::load_from_path(&config_path).expect("load default config");
    let default_profile = ProviderProfile {
        id: "offline-ollama-default".to_owned(),
        name: "Offline Ollama Default".to_owned(),
        provider_kind: Provider::Ollama,
        auth_method: AuthMethod::None,
        default_model: "llama3.2".to_owned(),
        base_url: Some("http://127.0.0.1:11434".to_owned()),
    };
    let override_profile = ProviderProfile {
        id: "offline-ollama-override".to_owned(),
        name: "Offline Ollama Override".to_owned(),
        provider_kind: Provider::Ollama,
        auth_method: AuthMethod::None,
        default_model: "codellama".to_owned(),
        base_url: Some("http://127.0.0.1:11435".to_owned()),
    };
    config.default_profile_id = Some(default_profile.id.clone());
    config.profiles = vec![default_profile, override_profile];
    config.save_to_path(&config_path).expect("save config");

    CredentialsConfig::default()
        .save_to_path(&credentials_path)
        .expect("save credentials");

    let pool = Arc::new(db::init_pool(&home.join("data.db")).await.expect("init pool"));
    db::run_migrations(pool.as_ref())
        .await
        .expect("run migrations");

    build_app(
        Arc::new(config),
        Arc::new(CredentialsConfig::default()),
        config_path,
        credentials_path,
        pool,
    )
    .await
    .expect("build app")
}

async fn spawn_test_server(home: &Path) -> (String, tokio::task::JoinHandle<()>) {
    let app = create_test_app(home).await;
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind test listener");
    let addr = listener.local_addr().expect("listener addr");
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.expect("serve test app");
    });
    (format!("http://{addr}"), server)
}

async fn wait_for_run(base_url: &str, conversation_id: &str) -> Value {
    let client = reqwest::Client::new();

    for _ in 0..40 {
        let response = client
            .get(format!("{base_url}/api/runs"))
            .query(&[("conversationId", conversation_id), ("limit", "1")])
            .send()
            .await
            .expect("query runs");
        assert_eq!(response.status(), StatusCode::OK);

        let body: Value = response.json().await.expect("parse runs response");
        if let Some(run) = body["items"].as_array().and_then(|items| items.first()) {
            return run.clone();
        }

        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    panic!("expected run for conversation {conversation_id}");
}

#[tokio::test]
async fn websocket_chat_persists_override_metadata_in_run_snapshot() {
    let home = tempfile::tempdir().expect("create temp home");
    let (base_url, server) = spawn_test_server(home.path()).await;
    let ws_url = base_url.replacen("http://", "ws://", 1) + "/api/ws/chat";
    let conversation_id = "ws-conversation-override";

    let (mut socket, _response) = connect_async(&ws_url)
        .await
        .expect("connect websocket");

    socket
        .send(Message::Text(
            json!({
                "conversation_id": conversation_id,
                "message": "Use the override profile",
                "profile_id": "offline-ollama-override",
                "thinking_mode": "high",
            })
            .to_string(),
        ))
        .await
        .expect("send chat payload");

    let run = wait_for_run(&base_url, conversation_id).await;
    assert_eq!(run["conversationId"], conversation_id);
    assert_eq!(run["provider"], "ollama");
    assert_eq!(run["model"], "codellama");
    assert_eq!(run["fallbackProfileId"], "offline-ollama-override");

    if let Some(Ok(message)) = socket.next().await {
        assert!(
            matches!(message, Message::Text(_) | Message::Close(_)),
            "unexpected websocket frame: {message:?}"
        );
    }

    let _ = socket.close(None).await;
    server.abort();
    let _ = server.await;
}
