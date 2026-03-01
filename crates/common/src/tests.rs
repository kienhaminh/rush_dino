use std::fs;

use crate::{config::{AppConfig, CredentialsConfig}, init};

#[test]
fn load_default_config_without_file() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    let path = root.join("config.toml");
    let config = AppConfig::load_from_path(&path).expect("default config should load");
    assert_eq!(config.port, 28847);
    assert_eq!(config.host, "127.0.0.1");
}

#[test]
fn ensure_dir_creates_expected_structure() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    init::ensure_rushdino_dir_at(&root).expect("dir init should work");

    assert!(root.join("documents").exists());
    assert!(root.join("plugins").exists());
    assert!(root.join("logs").exists());
    assert!(root.join("skills").exists());
    assert!(root.join("memory/MEMORY.md").exists());
    assert!(root.join("agents").exists());
    assert!(root.join("agents/general-assistant.toml").exists());
    assert!(root.join("agents/spawn-agent.toml").exists());

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
        telegram_bot_token: None,
        discord_bot_token: None,
        slack_bot_token: None,
        slack_app_token: None,
        codex_access_token: Some("codex-access".to_owned()),
        codex_refresh_token: Some("codex-refresh".to_owned()),
        codex_token_expires_at: Some(1_760_000_000),
        api_secret: None,
    };

    credentials
        .save_to_path(&path)
        .expect("credentials should save");

    let loaded = CredentialsConfig::load_from_path(&path).expect("credentials should load");
    assert_eq!(loaded.openai_api_key, credentials.openai_api_key);
    assert_eq!(loaded.anthropic_api_key, credentials.anthropic_api_key);
    assert_eq!(loaded.codex_access_token, credentials.codex_access_token);
    assert_eq!(loaded.codex_refresh_token, credentials.codex_refresh_token);
    assert_eq!(loaded.codex_token_expires_at, credentials.codex_token_expires_at);

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
        codex_token_expires_at: Some(42),
        ..CredentialsConfig::default()
    };

    credentials
        .save_to_path(&path)
        .expect("credentials should save");
    let loaded = CredentialsConfig::load_from_path(&path).expect("credentials should load");

    assert_eq!(loaded.openai_api_key.as_deref(), Some("new-key"));
    assert_eq!(loaded.codex_token_expires_at, Some(42));

    let _ = fs::remove_dir_all(root);
}
