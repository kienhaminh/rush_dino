use std::{path::Path, sync::Arc};

use axum::{
    body::{to_bytes, Body},
    http::{Method, Request, StatusCode},
};
use rushdino_common::{
    config::{AuthMethod, Provider, ProviderProfile},
    db, init, AppConfig, CredentialsConfig,
};
use rushdino_server::build_app;
use serde_json::{json, Value};
use tower::util::ServiceExt;

async fn create_test_app(home: &Path) -> axum::Router {
    init::ensure_rushdino_dir_at(home).expect("create rushdino home");
    std::fs::write(
        home.join("agents").join("data-analyst.md"),
        "---\nname: data-analyst\ndescription: Interprets local datasets\nicon: 📊\ntools: bash, read, glob, grep, agent_inbox\ninbox_enabled: true\nclaim_tags: data, analytics\n---\n\nYou analyze local files.\n",
    )
    .expect("seed data-analyst");
    std::fs::write(
        home.join("agents").join("writer.md"),
        "---\nname: writer\ndescription: Turns notes into prose\ninbox_enabled: true\n---\n\nYou write.\n",
    )
    .expect("seed writer");

    let config_path = home.join("config.toml");
    let credentials_path = home.join("credentials.toml");

    let mut config = AppConfig::load_from_path(&config_path).expect("load default config");
    let profile = ProviderProfile {
        id: "offline-ollama".to_owned(),
        name: "Offline Ollama".to_owned(),
        provider_kind: Provider::Ollama,
        auth_method: AuthMethod::None,
        default_model: "llama3.2".to_owned(),
        base_url: Some("http://127.0.0.1:11434".to_owned()),
    };
    config.default_profile_id = Some(profile.id.clone());
    config.profiles = vec![profile];
    config.save_to_path(&config_path).expect("save config");

    CredentialsConfig::default()
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

#[tokio::test]
async fn persist_then_list_returns_new_teammate_with_role() {
    let home = std::env::temp_dir().join(format!("rushdino-team-persist-{}", uuid::Uuid::new_v4()));
    let app = create_test_app(&home).await;
    let role = "Cleans local CSV files and reports row counts";

    let (status, created) = send_json(
        &app,
        Method::POST,
        "/api/agents",
        json!({
            "name": "csv wrangler",
            "description": role,
            "systemPrompt": "You clean CSVs on this machine.",
            "dataCapable": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(created["id"], "csv-wrangler");
    assert_eq!(created["description"], role);
    assert_eq!(created["dataCapable"], true);

    let (status, listed) = send_json(&app, Method::GET, "/api/agents", json!({})).await;
    assert_eq!(status, StatusCode::OK);
    let items = listed["items"].as_array().expect("items");
    let found = items
        .iter()
        .find(|item| item["id"] == "csv-wrangler")
        .expect("persisted teammate should appear in GET /api/agents");
    assert_eq!(found["description"], role);
    assert_eq!(found["dataCapable"], true);

    let _ = std::fs::remove_dir_all(&home);
}

#[tokio::test]
async fn assign_records_chosen_agent_identity() {
    let home = std::env::temp_dir().join(format!("rushdino-team-assign-{}", uuid::Uuid::new_v4()));
    let app = create_test_app(&home).await;

    let (status, assigned) = send_json(
        &app,
        Method::POST,
        "/api/agents/data-analyst/assign",
        json!({ "message": "Count rows in ./sales.csv" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(assigned["agentId"], "data-analyst");
    assert_eq!(assigned["agentName"], "data-analyst");
    assert_eq!(assigned["to"], "data-analyst");
    assert_eq!(assigned["from"], "operator");
    assert_eq!(assigned["message"], "Count rows in ./sales.csv");
    assert!(assigned["assignmentId"]
        .as_str()
        .is_some_and(|id| !id.is_empty()));
    assert_eq!(assigned["conversationId"], "data-analyst");

    let (status, inbox) = send_json(
        &app,
        Method::GET,
        "/api/messages?agent=data-analyst",
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let items = inbox["items"].as_array().expect("inbox items");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["from_agent"], "operator");
    assert_eq!(items[0]["to_agent"], "data-analyst");
    assert_eq!(items[0]["id"], assigned["assignmentId"]);

    let _ = std::fs::remove_dir_all(&home);
}

#[tokio::test]
async fn handoff_persists_sender_and_receiver() {
    let home = std::env::temp_dir().join(format!("rushdino-team-handoff-{}", uuid::Uuid::new_v4()));
    let app = create_test_app(&home).await;

    let (status, record) = send_json(
        &app,
        Method::POST,
        "/api/agents/data-analyst/handoff",
        json!({
            "to": "writer",
            "message": "Draft findings from notes.md"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(record["from_agent"], "data-analyst");
    assert_eq!(record["to_agent"], "writer");
    assert_eq!(record["content"], "Draft findings from notes.md");

    let (status, inbox) =
        send_json(&app, Method::GET, "/api/messages?agent=writer", json!({})).await;
    assert_eq!(status, StatusCode::OK);
    let items = inbox["items"].as_array().expect("inbox items");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["from_agent"], "data-analyst");
    assert_eq!(items[0]["to_agent"], "writer");
    assert_eq!(items[0]["id"], record["id"]);

    let _ = std::fs::remove_dir_all(&home);
}

#[test]
fn desktop_agents_surface_is_team_hq_not_raw_json_inspector() {
    let src =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../desktop-app/src");
    let sidebar =
        std::fs::read_to_string(src.join("ui/sidebar_view.rs")).expect("sidebar_view.rs");
    let chat = std::fs::read_to_string(src.join("ui/chat_view.rs")).expect("chat_view.rs");
    let models = std::fs::read_to_string(src.join("models.rs")).expect("models.rs");

    assert!(
        sidebar.contains("Destination::Agents"),
        "Agents must be a first-class sidebar destination"
    );
    assert!(
        models.contains("Self::Agents => Some(\"/api/agents\")"),
        "Agents surface must load the shipped agents collection"
    );
    assert!(
        chat.contains("crate::models::display_title")
            && chat.contains("crate::models::display_subtitle"),
        "Agent rows must render curated titles and subtitles, not raw JSON"
    );
}
