/// End-to-end test for the conversation compaction mechanism.
///
/// This test seeds a conversation with enough fake messages to push the estimated
/// token count over the 75 % compaction threshold, then sends a real chat message
/// and verifies that a `[Conversation history — compacted]` marker was written into
/// the conversation by the react loop.
///
/// The test requires a live LLM provider: it checks for OPENAI_API_KEY or
/// ANTHROPIC_API_KEY and skips itself when neither is set.
use std::{path::Path, sync::Arc};

use axum::{
    body::{to_bytes, Body},
    http::{Method, Request, StatusCode},
};
use chrono::Utc;
use rushdino_common::{
    config::{AgentSection, AuthMethod, ProfileSecrets, Provider, ProviderProfile},
    db, init, AppConfig, CredentialsConfig,
};
use rushdino_server::build_app;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tower::util::ServiceExt;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Helpers shared with system_smoke.rs (kept local to avoid test-only coupling)
// ---------------------------------------------------------------------------

async fn send_json(
    app: &axum::Router,
    method: Method,
    uri: &str,
    body: Value,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .expect("build request"),
        )
        .await
        .expect("send request");
    let status = response.status();
    let payload = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("read response body");
    (
        status,
        serde_json::from_slice(&payload).expect("response should be json"),
    )
}

async fn send_empty(app: &axum::Router, method: Method, uri: &str) -> (StatusCode, Value) {
    send_json(app, method, uri, json!({})).await
}

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

enum LiveProvider {
    OpenAI(String),
    Anthropic(String),
}

fn detect_live_provider() -> Option<LiveProvider> {
    if let Ok(key) = std::env::var("OPENAI_API_KEY") {
        if !key.trim().is_empty() {
            return Some(LiveProvider::OpenAI(key));
        }
    }
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        if !key.trim().is_empty() {
            return Some(LiveProvider::Anthropic(key));
        }
    }
    None
}

// ---------------------------------------------------------------------------
// App setup with real provider and low max_context_tokens
// ---------------------------------------------------------------------------

/// `max_context_tokens` is intentionally small so the seeded fake messages
/// push the conversation over the 75 % compaction threshold.
const TEST_MAX_CONTEXT_TOKENS: usize = 2_000;

async fn create_live_app(home: &Path, provider: &LiveProvider) -> (axum::Router, Arc<SqlitePool>) {
    init::ensure_rushdino_dir_at(home).expect("create rushdino home");
    std::fs::write(
        home.join("agents").join("software-engineer.md"),
        "---\nname: software-engineer\ndescription: Compaction test agent\n---\n\nYou are a helpful assistant.\n",
    )
    .expect("seed default agent");

    let config_path = home.join("config.toml");
    let credentials_path = home.join("credentials.toml");

    let mut config = AppConfig::load_from_path(&config_path).expect("load default config");
    config.agent = AgentSection {
        max_context_tokens: Some(TEST_MAX_CONTEXT_TOKENS),
        max_iterations: None,
    };

    let mut credentials = CredentialsConfig::default();

    let (profile, profile_id) = match provider {
        LiveProvider::OpenAI(key) => {
            let id = "test-openai".to_owned();
            credentials.profiles.insert(
                id.clone(),
                ProfileSecrets {
                    api_key: Some(key.clone()),
                    ..Default::default()
                },
            );
            (
                ProviderProfile {
                    id: id.clone(),
                    name: "Test OpenAI".to_owned(),
                    provider_kind: Provider::OpenAI,
                    auth_method: AuthMethod::ApiKey,
                    default_model: "gpt-4o-mini".to_owned(),
                    base_url: None,
                },
                id,
            )
        }
        LiveProvider::Anthropic(key) => {
            let id = "test-anthropic".to_owned();
            credentials.profiles.insert(
                id.clone(),
                ProfileSecrets {
                    api_key: Some(key.clone()),
                    ..Default::default()
                },
            );
            (
                ProviderProfile {
                    id: id.clone(),
                    name: "Test Anthropic".to_owned(),
                    provider_kind: Provider::Anthropic,
                    auth_method: AuthMethod::ApiKey,
                    default_model: "claude-haiku-4-5-20251001".to_owned(),
                    base_url: None,
                },
                id,
            )
        }
    };

    config.default_profile_id = Some(profile_id);
    config.profiles = vec![profile];
    config.save_to_path(&config_path).expect("save config");
    credentials
        .save_to_path(&credentials_path)
        .expect("save credentials");

    let pool = Arc::new(
        db::init_pool(&home.join("data.db"))
            .await
            .expect("init pool"),
    );
    db::run_migrations(pool.as_ref())
        .await
        .expect("run migrations");

    let app = build_app(
        Arc::new(config),
        Arc::new(credentials),
        config_path,
        credentials_path,
        pool.clone(),
    )
    .await
    .expect("build app");

    (app, pool)
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

/// Insert alternating user/assistant messages with `content_len`-byte content
/// directly into the DB so that their estimated token cost
/// (`content_len / 4` per message) pushes the conversation over the compaction
/// threshold.
async fn seed_large_messages(
    pool: &SqlitePool,
    conversation_id: &str,
    count: usize,
    content_len: usize,
) {
    let now = Utc::now().to_rfc3339();
    let filler = "x".repeat(content_len);

    for i in 0..count {
        let role = if i % 2 == 0 { "user" } else { "assistant" };
        let content = format!("[Seeded message {i}] {filler}");
        let id = Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(conversation_id)
        .bind(role)
        .bind(&content)
        .bind(&now)
        .execute(pool)
        .await
        .expect("seed message");
    }
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

#[tokio::test]
async fn compaction_marker_appears_after_context_overflow() {
    let Some(live_provider) = detect_live_provider() else {
        eprintln!(
            "Skipping compaction e2e test: set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable"
        );
        return;
    };

    let home = std::env::temp_dir().join(format!("rushdino-compaction-{}", Uuid::new_v4()));

    let (app, pool) = create_live_app(&home, &live_provider).await;

    // 1. Create a session.
    let (status, created_session) = send_json(
        &app,
        Method::POST,
        "/api/sessions",
        json!({ "title": "Compaction E2E" }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "create session failed: {created_session}"
    );
    let session_id = created_session["id"]
        .as_str()
        .expect("session id")
        .to_owned();

    // 2. Seed 20 messages with 400 chars each.
    //    Estimated tokens: 20 * (400/4) = 2 000, which exceeds the 75 % threshold
    //    of 2 000 * 0.75 = 1 500.  Adding the system prompt (~several hundred tokens)
    //    makes it comfortably over.
    seed_large_messages(&pool, &session_id, 20, 400).await;

    // 3. Send a simple real message to trigger the react loop.
    let (status, response) = send_json(
        &app,
        Method::POST,
        &format!("/api/sessions/{session_id}/messages"),
        json!({ "message": "What is 2 + 2? Reply with just the number." }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "chat request failed: {response}");

    // The agent should answer the question (not re-initialise).
    let reply = response["reply"].as_str().unwrap_or("").trim().to_owned();
    assert!(
        !reply.is_empty(),
        "expected a non-empty reply from the agent"
    );

    // 4. Fetch conversation detail and verify the compaction marker.
    let (status, detail) =
        send_empty(&app, Method::GET, &format!("/api/sessions/{session_id}")).await;
    assert_eq!(status, StatusCode::OK, "get session failed: {detail}");

    let messages = detail["messages"]
        .as_array()
        .expect("messages should be an array");

    let has_compaction_marker = messages.iter().any(|m| {
        m["content"]
            .as_str()
            .unwrap_or("")
            .contains("[Conversation history — compacted]")
    });
    assert!(
        has_compaction_marker,
        "expected a '[Conversation history — compacted]' marker in the conversation messages, \
         but none was found. Messages: {messages:?}"
    );

    let _ = std::fs::remove_dir_all(&home);
}
