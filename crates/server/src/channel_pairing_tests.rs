use std::{fs, sync::Arc};

use chrono::{Duration, Utc};
use rushdino_common::db::run_migrations;
use rushdino_gateway::IncomingMessage;
use sqlx::sqlite::SqlitePoolOptions;

use super::*;

fn dummy_broadcast_tx() -> tokio::sync::broadcast::Sender<serde_json::Value> {
    tokio::sync::broadcast::channel(1).0
}

async fn setup_pairing_service() -> ChannelPairingService {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect sqlite");
    run_migrations(&pool).await.expect("run migrations");
    ChannelPairingService::new(pool)
}

fn write_config(root: &std::path::Path, dm_policy: &str, allow_from: &[&str]) -> PathBuf {
    let path = root.join("config.toml");
    let allow_from = allow_from
        .iter()
        .map(|entry| format!("\"{entry}\""))
        .collect::<Vec<_>>()
        .join(", ");
    fs::write(
        &path,
        format!(
            r#"
host = "127.0.0.1"
port = 28847
log_level = "info"
active_provider = "ollama"
profiles = []
fallback_profile_ids = []
data_dir = "data"
db_path = "data.db"
brave_search_endpoint = "https://api.search.brave.com/res/v1/web/search"
allowed_chat_ids = []

[ollama]
base_url = "http://localhost:11434"
model = "llama3"

[openai]
model = "gpt-4.1"

[anthropic]
model = "claude-3-5-sonnet-latest"

[openai_codex]
model = "gpt-5-codex"

[gateway.telegram]
enabled = true

[gateway.telegram.access]
dm_policy = "{dm_policy}"
allow_from = [{allow_from}]

[gateway.discord]
enabled = false

[gateway.slack]
enabled = false

[gateway.webchat]
enabled = true
"#
        ),
    )
    .expect("write config");
    path
}

#[tokio::test]
async fn pairing_requests_are_reused_for_repeated_sender() {
    let service = setup_pairing_service().await;
    let (first, first_is_new) = service
        .create_or_refresh_request("telegram", "42", Some("Alice"), "42")
        .await
        .expect("first request");
    let (second, second_is_new) = service
        .create_or_refresh_request("telegram", "42", Some("Alice B"), "42")
        .await
        .expect("second request");

    assert!(first_is_new, "first request should be new");
    assert!(!second_is_new, "second request should be a refresh");
    assert_eq!(first.id, second.id);
    assert_eq!(first.code, second.code);
    assert_eq!(second.sender_display.as_deref(), Some("Alice B"));
}

#[tokio::test]
async fn approving_request_moves_sender_to_paired_list() {
    let service = setup_pairing_service().await;
    let (request, _) = service
        .create_or_refresh_request("telegram", "42", Some("Alice"), "42")
        .await
        .expect("request");
    let approved = service
        .decide_request("telegram", &request.id, true)
        .await
        .expect("approve")
        .expect("paired sender");

    assert_eq!(approved.sender_id, "42");
    let paired = service.list_paired("telegram").await.expect("paired");
    assert_eq!(paired.len(), 1);
    assert_eq!(paired[0].sender_id, "42");
    let pending = service.list_pending("telegram").await.expect("pending");
    assert!(pending.is_empty());
}

#[tokio::test]
async fn expired_requests_are_pruned() {
    let service = setup_pairing_service().await;
    let (request, _) = service
        .create_or_refresh_request("telegram", "42", Some("Alice"), "42")
        .await
        .expect("request");
    let expired = (Utc::now() - Duration::days(1)).to_rfc3339();
    sqlx::query("UPDATE channel_pairing_requests SET expires_at = ?2 WHERE id = ?1")
        .bind(&request.id)
        .bind(expired)
        .execute(&service.pool)
        .await
        .expect("expire request");

    let pending = service.list_pending("telegram").await.expect("pending");
    assert!(pending.is_empty());
}

#[tokio::test]
async fn ingress_policy_blocks_unpaired_direct_messages() {
    let service = Arc::new(setup_pairing_service().await);
    let root = std::env::temp_dir().join(format!("rushdino-pairing-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).expect("temp dir");
    let config_path = write_config(&root, "pairing", &[]);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect sqlite");
    run_migrations(&pool).await.expect("run migrations");
    let logs = Arc::new(RuntimeLogStore::new(Arc::new(pool), None));
    let policy = ChannelPairingIngressPolicy::new(config_path, service.clone(), logs, dummy_broadcast_tx());

    let decision = policy
        .evaluate(&IncomingMessage {
            channel_id: "telegram".to_owned(),
            sender_id: "chat-1".to_owned(),
            actor_id: "42".to_owned(),
            actor_display: Some("Alice".to_owned()),
            reply_target: "chat-1".to_owned(),
            is_direct_message: true,
            enable_streaming_preview: false,
            external_message_id: Some("msg-1".to_owned()),
            text: "hello".to_owned(),
            timestamp: Utc::now(),
        })
        .await
        .expect("evaluate");

    match decision {
        IngressDecision::Block {
            response: Some(response),
            ..
        } => {
            assert_eq!(response.recipient, "chat-1");
            assert!(response.message.fallback_text.contains("Pairing code"));
        }
        other => panic!("expected block with response, got {other:?}"),
    }

    let pending = service.list_pending("telegram").await.expect("pending");
    assert_eq!(pending.len(), 1);

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn ingress_policy_allows_manual_allowlist_sender() {
    let service = Arc::new(setup_pairing_service().await);
    let root = std::env::temp_dir().join(format!("rushdino-pairing-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).expect("temp dir");
    let config_path = write_config(&root, "allowlist", &["42"]);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect sqlite");
    run_migrations(&pool).await.expect("run migrations");
    let logs = Arc::new(RuntimeLogStore::new(Arc::new(pool), None));
    let policy = ChannelPairingIngressPolicy::new(config_path, service, logs, dummy_broadcast_tx());

    let decision = policy
        .evaluate(&IncomingMessage {
            channel_id: "telegram".to_owned(),
            sender_id: "chat-1".to_owned(),
            actor_id: "42".to_owned(),
            actor_display: Some("Alice".to_owned()),
            reply_target: "chat-1".to_owned(),
            is_direct_message: true,
            enable_streaming_preview: false,
            external_message_id: Some("msg-1".to_owned()),
            text: "hello".to_owned(),
            timestamp: Utc::now(),
        })
        .await
        .expect("evaluate");

    assert!(matches!(decision, IngressDecision::Allow));

    let _ = fs::remove_dir_all(root);
}
