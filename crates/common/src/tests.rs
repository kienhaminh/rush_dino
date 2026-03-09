use std::fs;

use crate::{
    config::{AppConfig, CredentialsConfig, DmPolicy},
    init,
};

#[derive(serde::Deserialize)]
struct BundledAgentTemplate {
    name: String,
    description: String,
    system_prompt: String,
    icon: Option<String>,
}

#[test]
fn load_default_config_without_file() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    let path = root.join("config.toml");
    let config = AppConfig::load_from_path(&path).expect("default config should load");
    assert_eq!(config.port, 28847);
    assert_eq!(config.host, "127.0.0.1");
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
    assert!(root.join("agents/general-assistant.toml").exists());
    assert!(root.join("agents/spawn-agent.toml").exists());

    let _ = fs::remove_dir_all(root);
}

#[test]
fn ensure_dir_migrates_legacy_memory_file_to_root() {
    let root = std::env::temp_dir().join(format!("rushdino-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(root.join("memory")).expect("legacy memory dir");
    fs::write(root.join("memory/MEMORY.md"), "# MEMORY\n\nlegacy\n").expect("legacy memory");

    init::ensure_rushdino_dir_at(&root).expect("dir init should work");

    let root_memory = fs::read_to_string(root.join("MEMORY.md")).expect("root memory should exist");
    assert!(root_memory.contains("legacy"));

    let _ = fs::remove_dir_all(root);
}

#[test]
fn bundled_agents_are_valid_and_named_consistently() {
    let mut names = std::collections::HashSet::new();
    for (key, content) in crate::agents::BUNDLED_AGENTS {
        let template: BundledAgentTemplate =
            toml::from_str(content).unwrap_or_else(|e| panic!("invalid bundled agent {key}: {e}"));
        assert_eq!(&template.name, key, "template name must match bundle key");
        assert!(
            names.insert(template.name.clone()),
            "duplicate bundled agent name: {}",
            template.name
        );
        assert!(
            !template.description.trim().is_empty(),
            "template {} must have description",
            template.name
        );
        assert!(
            !template.system_prompt.trim().is_empty(),
            "template {} must have system prompt",
            template.name
        );
        if let Some(icon) = template.icon {
            assert!(
                !icon.trim().is_empty(),
                "template {} icon cannot be blank",
                template.name
            );
        }
    }
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
        profiles: std::collections::HashMap::new(),
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
    assert_eq!(
        loaded.codex_token_expires_at,
        credentials.codex_token_expires_at
    );

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

[openai_codex]
model = "gpt-5-codex"

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
