use std::{fs, path::Path, path::PathBuf};

use figment::{
    providers::{Env, Format, Serialized, Toml},
    Figment,
};
use serde::{Deserialize, Serialize};

use crate::{error::Result, init};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderKind {
    Ollama,
    Openai,
    Anthropic,
    Codex,
    Plugin,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderModelConfig {
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaConfig {
    pub base_url: String,
    pub model: String,
}

/// Per-channel enable/disable flag.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelConfig {
    pub enabled: bool,
}

/// Gateway configuration: controls which channels are active.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayConfig {
    pub telegram: ChannelConfig,
    pub discord: ChannelConfig,
    pub slack: ChannelConfig,
    pub webchat: ChannelConfig,
}

impl Default for GatewayConfig {
    fn default() -> Self {
        Self {
            telegram: ChannelConfig { enabled: true },
            discord: ChannelConfig { enabled: false },
            slack: ChannelConfig { enabled: false },
            webchat: ChannelConfig { enabled: true },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub log_level: String,
    pub active_provider: ProviderKind,
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub brave_search_endpoint: String,
    pub allowed_chat_ids: Vec<i64>,
    pub ollama: OllamaConfig,
    pub openai: ProviderModelConfig,
    pub anthropic: ProviderModelConfig,
    pub codex: ProviderModelConfig,
    /// Optional provider to use when Codex token refresh fails at startup.
    pub codex_fallback_provider: Option<ProviderKind>,
    pub gateway: GatewayConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        let home = init::default_home_dir();
        Self {
            host: "127.0.0.1".to_owned(),
            port: 28847,
            log_level: "info".to_owned(),
            active_provider: ProviderKind::Ollama,
            db_path: home.join("data.db"),
            data_dir: home,
            brave_search_endpoint: "https://api.search.brave.com/res/v1/web/search".to_owned(),
            allowed_chat_ids: Vec::new(),
            ollama: OllamaConfig {
                base_url: "http://localhost:11434/v1".to_owned(),
                model: "llama3.2:latest".to_owned(),
            },
            openai: ProviderModelConfig {
                model: "gpt-4.1-mini".to_owned(),
            },
            anthropic: ProviderModelConfig {
                model: "claude-3-5-sonnet-latest".to_owned(),
            },
            codex: ProviderModelConfig {
                model: "gpt-4.1-mini".to_owned(),
            },
            codex_fallback_provider: None,
            gateway: GatewayConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CredentialsConfig {
    pub openai_api_key: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub brave_api_key: Option<String>,
    pub telegram_bot_token: Option<String>,
    pub discord_bot_token: Option<String>,
    pub slack_bot_token: Option<String>,
    /// Slack Socket Mode app-level token (xapp-...)
    pub slack_app_token: Option<String>,
    /// OpenAI Codex OAuth access token
    pub codex_access_token: Option<String>,
    /// OpenAI Codex OAuth refresh token
    pub codex_refresh_token: Option<String>,
    /// Unix timestamp (seconds) when codex_access_token expires
    pub codex_token_expires_at: Option<i64>,
}

impl AppConfig {
    pub fn load() -> Result<Self> {
        let home = init::default_home_dir();
        let config_path = home.join("config.toml");
        Self::load_from_path(&config_path)
    }

    pub fn load_from_path(path: &Path) -> Result<Self> {
        let figment = Figment::from(Serialized::defaults(Self::default()))
            .merge(Toml::file(path))
            .merge(Env::prefixed("RUSHDINO_").split("__"));
        Ok(figment.extract()?)
    }
}

impl CredentialsConfig {
    pub fn load() -> Result<Self> {
        let home = init::default_home_dir();
        let path = home.join("credentials.toml");
        Self::load_from_path(&path)
    }

    pub fn load_from_path(path: &Path) -> Result<Self> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let figment = Figment::from(Serialized::defaults(Self::default())).merge(Toml::file(path));
        Ok(figment.extract()?)
    }

    pub fn save_to_path(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let serialized = toml::to_string(self)
            .map_err(|e| crate::AppError::Validation(format!("failed to serialize credentials: {e}")))?;
        let tmp_path = path.with_extension("tmp");
        fs::write(&tmp_path, serialized)?;
        fs::rename(tmp_path, path)?;
        Ok(())
    }
}
