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

// ---------------------------------------------------------------------------
// TLS / security configuration
// ---------------------------------------------------------------------------

/// TLS termination mode for the HTTP server.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum TlsMode {
    /// No TLS — plain HTTP.  Use this when TLS is terminated upstream (Nginx/Caddy).
    #[default]
    Proxy,
    /// Native TLS — `axum-server` binds HTTPS directly using the cert/key paths below.
    Native,
}

/// Security-related settings for the HTTP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    /// TLS mode: `"proxy"` (default) or `"native"`.
    pub tls_mode: TlsMode,
    /// Path to the TLS certificate file (PEM).  Required when `tls_mode = "native"`.
    pub tls_cert: Option<PathBuf>,
    /// Path to the TLS private key file (PEM).  Required when `tls_mode = "native"`.
    pub tls_key: Option<PathBuf>,
    /// Allowed CORS origins.  If empty, falls back to `localhost`-only defaults.
    /// Example: `["http://localhost:3000", "https://yourdomain.com"]`
    pub allowed_origins: Vec<String>,
    /// Whether HMAC-SHA256 authentication is required on all API requests.
    /// Defaults to `false` so existing installs keep working until they opt in.
    pub hmac_auth_enabled: bool,
    /// SSRF: hosts explicitly allowed even if their IPs are in private ranges.
    pub allowed_external_hosts: Vec<String>,
    /// Allowed root paths for document/file operations (path traversal guard).
    /// Defaults to the `data_dir` configured in `AppConfig`.
    pub allowed_read_roots: Vec<PathBuf>,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            tls_mode: TlsMode::Proxy,
            tls_cert: None,
            tls_key: None,
            allowed_origins: vec![
                "http://localhost:3000".to_owned(),
                "http://localhost:28847".to_owned(),
            ],
            hmac_auth_enabled: false,
            allowed_external_hosts: Vec::new(),
            allowed_read_roots: Vec::new(),
        }
    }
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
    pub security: SecurityConfig,
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
            security: SecurityConfig::default(),
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
    /// HMAC-SHA256 API secret (hex-encoded 256-bit key).  Generated on `rushdino init`.
    pub api_secret: Option<String>,
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

    pub fn save_to_path(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let serialized = toml::to_string(self)
            .map_err(|e| crate::AppError::Validation(format!("failed to serialize config: {e}")))?;
        let tmp_path = path.with_extension("tmp");
        fs::write(&tmp_path, &serialized)?;
        fs::rename(&tmp_path, path)?;
        Ok(())
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
