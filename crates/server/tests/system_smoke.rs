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
        home.join("agents").join("general-assistant.md"),
        "---\nname: general-assistant\ndescription: Offline smoke agent\n---\n\nYou are the offline smoke-test agent.\n",
    )
    .expect("seed default workflow agent");

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
        true,
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

async fn send_empty(app: &axum::Router, method: Method, uri: &str) -> (StatusCode, Value) {
    send_json(app, method, uri, json!({})).await
}

#[tokio::test]
async fn offline_app_smoke_covers_core_routes() {
    let home = std::env::temp_dir().join(format!("rushdino-server-smoke-{}", uuid::Uuid::new_v4()));
    let app = create_test_app(&home).await;

    let (status, health) = send_empty(&app, Method::GET, "/healthz").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(health["status"], "ok");
    assert_eq!(health["provider"], "ollama");

    let (status, auth_status) = send_empty(&app, Method::GET, "/api/dashboard-auth/status").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(auth_status["enabled"], false);

    let (status, config_before) = send_empty(&app, Method::GET, "/api/config").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(config_before["gateway"]["webchat"]["enabled"], true);

    let (status, config_after) = send_json(
        &app,
        Method::PATCH,
        "/api/config",
        json!({ "gateway": { "webchat": { "enabled": false } } }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(config_after["gateway"]["webchat"]["enabled"], false);

    let (status, created_skill) = send_json(
        &app,
        Method::POST,
        "/api/skills",
        json!({
            "name": "smoke-skill",
            "description": "Smoke suite skill",
            "instructions": "Do smoke-suite work.",
            "tools": ["shell_exec"]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(created_skill["name"], "smoke-skill");

    let (status, skills) = send_empty(&app, Method::GET, "/api/skills").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(skills["items"].as_array().expect("skills items").len(), 1);

    let (status, created_session) = send_json(
        &app,
        Method::POST,
        "/api/sessions",
        json!({ "title": "Smoke Session" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(created_session["title"], "Smoke Session");

    let (status, sessions) = send_empty(&app, Method::GET, "/api/sessions").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(sessions["items"].as_array().expect("session items").len(), 1);

    let (status, workflows_before) = send_empty(&app, Method::GET, "/api/workflows").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(workflows_before["items"].as_array().expect("workflow items").len(), 0);

    let (status, workflow) = send_json(
        &app,
        Method::POST,
        "/api/workflows",
        json!({
            "name": "Smoke Workflow",
            "description": "Offline smoke workflow",
            "status": "draft",
            "steps": [
                {
                    "name": "Draft step",
                    "instructions": "Inspect the smoke suite.",
                    "agentId": "general-assistant"
                }
            ]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(workflow["name"], "Smoke Workflow");

    let (status, cron_job) = send_json(
        &app,
        Method::POST,
        "/api/cron",
        json!({
            "name": "Smoke Cron",
            "description": "Offline cron smoke job",
            "schedule": { "kind": "every", "interval_seconds": 3600 },
            "target": {
                "kind": "agent_turn",
                "message": "Summarize smoke coverage",
                "title": "Smoke cron turn"
            },
            "enabled": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(cron_job["name"], "Smoke Cron");

    for route in [
        "/api/runs",
        "/api/cron",
        "/api/gateway/summary",
        "/api/gateway/infrastructure",
        "/api/approvals",
        "/api/system/summary",
        "/api/system/soul-memory",
        "/api/system/tools",
        "/api/usage/metrics",
    ] {
        let (status, _body) = send_empty(&app, Method::GET, route).await;
        assert_eq!(status, StatusCode::OK, "route {route} should be healthy");
    }

    let _ = std::fs::remove_dir_all(home);
}
