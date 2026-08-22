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
        home.join("agents").join("software-engineer.md"),
        "---\nname: software-engineer\ndescription: Mobile channel test agent\n---\n\nYou are the mobile-channel test agent.\n",
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

async fn send_request(
    app: &axum::Router,
    method: Method,
    uri: &str,
    body: Option<Value>,
    bearer: Option<&str>,
) -> (StatusCode, Value) {
    let request = {
        let mut builder = Request::builder().method(method).uri(uri);
        if let Some(token) = bearer {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        if body.is_some() {
            builder = builder.header("content-type", "application/json");
        }
        builder
            .body(match body {
                Some(value) => Body::from(value.to_string()),
                None => Body::empty(),
            })
            .expect("build request")
    };

    let response = app.clone().oneshot(request).await.expect("send request");
    let status = response.status();
    let payload = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("read response body");
    if payload.is_empty() {
        return (status, json!({}));
    }
    (
        status,
        serde_json::from_slice(&payload).expect("response should be json"),
    )
}

#[tokio::test]
async fn mobile_channel_key_can_be_issued_validated_and_revoked() {
    let home = std::env::temp_dir().join(format!("rushdino-mobile-http-{}", uuid::Uuid::new_v4()));
    let app = create_test_app(&home).await;

    let (status, config_after) = send_request(
        &app,
        Method::PATCH,
        "/api/config",
        Some(json!({
            "gateway": {
                    "mobile": {
                        "enabled": true,
                        "publish_host": "https://rushdino.tailnet.ts.net"
                    }
            }
        })),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "config patch failed: {config_after}"
    );

    let (status, issued) = send_request(
        &app,
        Method::POST,
        "/api/channels/mobile/keys",
        Some(json!({ "label": "Alice iPhone" })),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "key issue failed: {issued}");

    let key_id = issued["id"].as_str().expect("key id").to_owned();
    let sender_id = issued["senderId"].as_str().expect("sender id").to_owned();
    let api_key = issued["apiKey"].as_str().expect("api key").to_owned();
    assert_eq!(issued["qrPayload"]["kind"], "rushdino_mobile_connect");
    assert_eq!(issued["qrPayload"]["version"], 1);
    assert_eq!(
        issued["qrPayload"]["host"],
        "https://rushdino.tailnet.ts.net"
    );
    assert_eq!(issued["qrPayload"]["apiKey"], api_key);

    let (status, listed) =
        send_request(&app, Method::GET, "/api/channels/mobile/keys", None, None).await;
    assert_eq!(status, StatusCode::OK, "key list failed: {listed}");
    let items = listed["items"].as_array().expect("items array");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["id"], key_id);
    assert_eq!(items[0]["senderId"], sender_id);
    assert_eq!(items[0]["label"], "Alice iPhone");
    assert!(
        items[0].get("apiKey").is_none(),
        "raw api key must not be listed after issuance"
    );

    let (status, connected) = send_request(
        &app,
        Method::GET,
        "/api/channels/mobile/connect",
        None,
        Some(&api_key),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "connect failed: {connected}");
    assert_eq!(connected["channelId"], "mobile");
    assert_eq!(connected["senderId"], sender_id);
    assert_eq!(connected["label"], "Alice iPhone");
    assert_eq!(connected["publishHost"], "https://rushdino.tailnet.ts.net");
    assert_eq!(connected["websocketPath"], "/api/channels/mobile/ws");

    let (status, revoked) = send_request(
        &app,
        Method::DELETE,
        &format!("/api/channels/mobile/keys/{key_id}"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "revoke failed: {revoked}");
    assert_eq!(revoked["revoked"], true);

    let (status, denied) = send_request(
        &app,
        Method::GET,
        "/api/channels/mobile/connect",
        None,
        Some(&api_key),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "connect should fail: {denied}"
    );
    assert_eq!(denied["error"], "mobile_api_key_invalid");

    let _ = std::fs::remove_dir_all(home);
}
