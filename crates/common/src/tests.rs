use std::fs;

use crate::{
    config::{AppConfig, CredentialsConfig, DmPolicy},
    db, init,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Run `f` with `var` set to `value`, restoring the original value (or
/// removing the variable) even if `f` panics.  This prevents env-var leakage
/// between parallel tests.
fn with_env_var<F: FnOnce() + std::panic::UnwindSafe>(var: &str, value: &str, f: F) {
    let previous = std::env::var(var).ok();
    // SAFETY: tests run in a single process; we restore the value afterwards.
    unsafe { std::env::set_var(var, value) };
    let result = std::panic::catch_unwind(f);
    match previous {
        Some(v) => unsafe { std::env::set_var(var, v) },
        None => unsafe { std::env::remove_var(var) },
    }
    if let Err(e) = result {
        std::panic::resume_unwind(e);
    }
}

#[test]
fn load_default_config_without_file() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    let path = root.join("config.toml");
    let config = AppConfig::load_from_path(&path).expect("default config should load");
    assert_eq!(config.port, 28847);
    assert_eq!(config.host, "0.0.0.0");
    assert!(!config.security.dashboard_auth_enabled);
    assert!(config.execution.shell_exec_sandbox.enabled);
    assert_eq!(config.gateway.telegram.access.dm_policy, DmPolicy::Pairing);
    assert_eq!(config.gateway.discord.access.dm_policy, DmPolicy::Pairing);
    assert!(config
        .execution
        .shell_exec_sandbox
        .workspace_root
        .ends_with("workspaces"));
}

#[test]
fn config_loads_dashboard_auth_flag_from_security_block() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).expect("temp dir should be created");
    let path = root.join("config.toml");
    fs::write(
        &path,
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

[gateway.telegram]
enabled = true

[gateway.discord]
enabled = false

[gateway.slack]
enabled = false

[gateway.webchat]
enabled = true

[security]
dashboard_auth_enabled = true
hmac_auth_enabled = false
allowed_origins = ["http://localhost:28847"]
"#,
    )
    .expect("seed config");

    let config = AppConfig::load_from_path(&path).expect("config should load");
    assert!(config.security.dashboard_auth_enabled);

    let _ = fs::remove_dir_all(root);
}

#[test]
fn ensure_dir_creates_expected_structure() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    init::ensure_rushdino_dir_at(&root).expect("dir init should work");

    assert!(root.join("documents").exists());
    assert!(root.join("plugins").exists());
    assert!(root.join("logs").exists());
    assert!(root.join("workspaces").exists());
    assert!(root.join("skills").exists());
    assert!(root.join("MEMORY.md").exists());
    assert!(root.join("agents").exists());

    let _ = fs::remove_dir_all(root);
}

#[test]
fn credentials_save_round_trip_special_chars() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).expect("temp dir should be created");
    let path = root.join("credentials.toml");

    let credentials = CredentialsConfig {
        openai_api_key: Some("sk-test-\"quote\"".to_owned()),
        anthropic_api_key: Some("anthropic-line\\nvalue".to_owned()),
        brave_api_key: None,
        gemini_api_key: None,
        telegram_bot_token: None,
        discord_bot_token: None,
        slack_bot_token: None,
        profiles: std::collections::HashMap::new(),
        slack_app_token: None,
        api_secret: None,
    };

    credentials
        .save_to_path(&path)
        .expect("credentials should save");

    let loaded = CredentialsConfig::load_from_path(&path).expect("credentials should load");
    assert_eq!(loaded.openai_api_key, credentials.openai_api_key);
    assert_eq!(loaded.anthropic_api_key, credentials.anthropic_api_key);

    let _ = fs::remove_dir_all(root);
}

#[test]
fn credentials_save_overwrites_existing_file() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).expect("temp dir should be created");
    let path = root.join("credentials.toml");

    fs::write(&path, "openai_api_key = \"old\"\n").expect("seed credentials file");

    let credentials = CredentialsConfig {
        openai_api_key: Some("new-key".to_owned()),
        ..CredentialsConfig::default()
    };

    credentials
        .save_to_path(&path)
        .expect("credentials should save");
    let loaded = CredentialsConfig::load_from_path(&path).expect("credentials should load");

    assert_eq!(loaded.openai_api_key.as_deref(), Some("new-key"));

    let _ = fs::remove_dir_all(root);
}

#[test]
fn config_loads_legacy_channel_config_without_access_block() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).expect("temp dir should be created");
    let path = root.join("config.toml");
    fs::write(
        &path,
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

[gateway.telegram]
enabled = true

[gateway.discord]
enabled = false

[gateway.slack]
enabled = false

[gateway.webchat]
enabled = true
"#,
    )
    .expect("seed config");

    let config = AppConfig::load_from_path(&path).expect("config should load");
    assert_eq!(config.gateway.telegram.access.dm_policy, DmPolicy::Pairing);
    assert!(config.gateway.telegram.access.allow_from.is_empty());
    assert_eq!(config.gateway.discord.access.dm_policy, DmPolicy::Pairing);
    assert!(!config.gateway.telegram.native_streaming);

    let _ = fs::remove_dir_all(root);
}

// ---------------------------------------------------------------------------
// CredentialsConfig::with_env_fallbacks
// ---------------------------------------------------------------------------

#[test]
fn env_fallback_picks_up_brave_api_key_when_field_is_none() {
    with_env_var("BRAVE_API_KEY", "brave-env-key", || {
        let creds = CredentialsConfig::default().with_env_fallbacks();
        assert_eq!(creds.brave_api_key.as_deref(), Some("brave-env-key"));
    });
}

#[test]
fn env_fallback_picks_up_openai_api_key_when_field_is_none() {
    with_env_var("OPENAI_API_KEY", "sk-env-openai", || {
        let creds = CredentialsConfig::default().with_env_fallbacks();
        assert_eq!(creds.openai_api_key.as_deref(), Some("sk-env-openai"));
    });
}

#[test]
fn env_fallback_picks_up_anthropic_and_gemini_keys() {
    with_env_var("ANTHROPIC_API_KEY", "anth-env", || {
        with_env_var("GEMINI_API_KEY", "gemini-env", || {
            let creds = CredentialsConfig::default().with_env_fallbacks();
            assert_eq!(creds.anthropic_api_key.as_deref(), Some("anth-env"));
            assert_eq!(creds.gemini_api_key.as_deref(), Some("gemini-env"));
        });
    });
}

#[test]
fn env_fallback_does_not_override_file_value() {
    // A key that is already set in the file must not be replaced by an env var.
    with_env_var("BRAVE_API_KEY", "env-override-attempt", || {
        let creds = CredentialsConfig {
            brave_api_key: Some("from-file".to_owned()),
            ..CredentialsConfig::default()
        }
        .with_env_fallbacks();
        assert_eq!(
            creds.brave_api_key.as_deref(),
            Some("from-file"),
            "file value must win over env var"
        );
    });
}

#[test]
fn env_fallback_ignores_empty_env_var() {
    with_env_var("BRAVE_API_KEY", "", || {
        let creds = CredentialsConfig::default().with_env_fallbacks();
        assert!(
            creds.brave_api_key.is_none(),
            "empty env var must not populate the field"
        );
    });
}

#[test]
fn env_fallback_round_trip_with_credentials_file() {
    // Simulate the full load -> with_env_fallbacks flow: file has openai key,
    // env var provides the brave key that is missing from the file.
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).expect("temp dir should be created");
    let path = root.join("credentials.toml");
    fs::write(&path, "openai_api_key = \"sk-from-file\"\n").expect("write credentials");

    with_env_var("BRAVE_API_KEY", "brave-from-env", || {
        let creds = CredentialsConfig::load_from_path(&path)
            .expect("load should succeed")
            .with_env_fallbacks();
        assert_eq!(creds.openai_api_key.as_deref(), Some("sk-from-file"));
        assert_eq!(creds.brave_api_key.as_deref(), Some("brave-from-env"));
    });

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn dashboard_auth_code_can_only_be_exchanged_once() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).expect("temp dir should be created");
    let db_path = root.join("data.db");
    let pool = db::init_pool(&db_path)
        .await
        .expect("pool should initialize");

    let service = crate::dashboard_auth::DashboardAuthService::new(pool.clone());
    let issued = service.issue_code().await.expect("code should issue");
    let session = service
        .exchange_code(&issued.code)
        .await
        .expect("first exchange should succeed");

    let validated = service
        .validate_session(&session.token)
        .await
        .expect("session validation should succeed");
    assert!(validated.is_some(), "new session should validate");

    let second_exchange = service.exchange_code(&issued.code).await;
    assert!(second_exchange.is_err(), "code reuse should fail");

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn dashboard_auth_new_login_revokes_existing_session() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).expect("temp dir should be created");
    let db_path = root.join("data.db");
    let pool = db::init_pool(&db_path)
        .await
        .expect("pool should initialize");

    let service = crate::dashboard_auth::DashboardAuthService::new(pool.clone());
    let first_code = service.issue_code().await.expect("first code should issue");
    let first_session = service
        .exchange_code(&first_code.code)
        .await
        .expect("first exchange should succeed");

    let second_code = service
        .issue_code()
        .await
        .expect("second code should issue");
    let second_session = service
        .exchange_code(&second_code.code)
        .await
        .expect("second exchange should succeed");

    let first_validation = service
        .validate_session(&first_session.token)
        .await
        .expect("first session validation should succeed");
    assert!(
        first_validation.is_none(),
        "previous session should be revoked"
    );

    let second_validation = service
        .validate_session(&second_session.token)
        .await
        .expect("second session validation should succeed");
    assert!(
        second_validation.is_some(),
        "latest session should stay active"
    );

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn dashboard_auth_session_survives_service_restart() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).expect("temp dir should be created");
    let db_path = root.join("data.db");

    let token = {
        let pool = db::init_pool(&db_path)
            .await
            .expect("pool should initialize");
        let service = crate::dashboard_auth::DashboardAuthService::new(pool.clone());
        let code = service.issue_code().await.expect("code should issue");
        let session = service
            .exchange_code(&code.code)
            .await
            .expect("exchange should succeed");
        session.token
    };

    let restarted_pool = db::init_pool(&db_path)
        .await
        .expect("pool should initialize after restart");
    let restarted_service = crate::dashboard_auth::DashboardAuthService::new(restarted_pool);
    let validated = restarted_service
        .validate_session(&token)
        .await
        .expect("session validation should succeed after restart");
    assert!(validated.is_some(), "session should survive restart");

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn dashboard_auth_can_revoke_specific_session_token() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).expect("temp dir should be created");
    let db_path = root.join("data.db");
    let pool = db::init_pool(&db_path)
        .await
        .expect("pool should initialize");

    let service = crate::dashboard_auth::DashboardAuthService::new(pool);
    let code = service.issue_code().await.expect("code should issue");
    let session = service
        .exchange_code(&code.code)
        .await
        .expect("exchange should succeed");

    service
        .revoke_session(&session.token)
        .await
        .expect("revoke should succeed");

    let validated = service
        .validate_session(&session.token)
        .await
        .expect("validation should succeed");
    assert!(validated.is_none(), "revoked session should not validate");

    let _ = fs::remove_dir_all(root);
}
