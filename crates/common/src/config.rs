use std::{collections::HashMap, fs, path::Path, path::PathBuf};

use figment::{
    providers::{Env, Format, Serialized, Toml},
    Figment,
};
use serde::{Deserialize, Serialize};

use crate::{error::Result, init};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Ollama,
    /// Accepts legacy "openai_codex" / "codex" values from older configs.
    #[serde(alias = "openai_codex", alias = "codex")]
    OpenAI,
    Anthropic,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuthMethod {
    ApiKey,
    OAuth,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderProfile {
    pub id: String,
    pub name: String,
    pub provider_kind: Provider,
    pub auth_method: AuthMethod,
    pub default_model: String,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProfileSecrets {
    pub api_key: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub token_expires_at: Option<i64>,
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
    /// Whether the browser dashboard requires a login-code-issued session.
    /// Defaults to `false` so existing installs keep working until they opt in.
    pub dashboard_auth_enabled: bool,
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
            dashboard_auth_enabled: false,
            allowed_external_hosts: Vec::new(),
            allowed_read_roots: Vec::new(),
        }
    }
}

/// Per-channel enable/disable flag.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DmPolicy {
    #[default]
    Open,
    Pairing,
    Allowlist,
    Disabled,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChannelAccessConfig {
    #[serde(default)]
    pub dm_policy: DmPolicy,
    #[serde(default)]
    pub allow_from: Vec<String>,
}

/// Per-channel enable/disable flag.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChannelConfig {
    pub enabled: bool,
    #[serde(default)]
    pub access: ChannelAccessConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TelegramChannelConfig {
    pub enabled: bool,
    #[serde(default)]
    pub access: ChannelAccessConfig,
    #[serde(default)]
    pub native_streaming: bool,
}

/// Gateway configuration: controls which channels are active.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayConfig {
    pub telegram: TelegramChannelConfig,
    pub discord: ChannelConfig,
    pub slack: ChannelConfig,
    pub webchat: ChannelConfig,
}

impl Default for GatewayConfig {
    fn default() -> Self {
        Self {
            telegram: TelegramChannelConfig {
                enabled: true,
                access: ChannelAccessConfig {
                    dm_policy: DmPolicy::Pairing,
                    allow_from: Vec::new(),
                },
                native_streaming: false,
            },
            discord: ChannelConfig {
                enabled: false,
                access: ChannelAccessConfig {
                    dm_policy: DmPolicy::Pairing,
                    allow_from: Vec::new(),
                },
            },
            slack: ChannelConfig {
                enabled: false,
                access: ChannelAccessConfig::default(),
            },
            webchat: ChannelConfig {
                enabled: true,
                access: ChannelAccessConfig::default(),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ShellExecSandboxConfig {
    pub enabled: bool,
    pub workspace_root: PathBuf,
    pub allow_network: bool,
    pub extra_write_roots: Vec<PathBuf>,
}

impl Default for ShellExecSandboxConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            workspace_root: PathBuf::from("workspaces"),
            allow_network: false,
            extra_write_roots: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExecutionConfig {
    pub shell_exec_sandbox: ShellExecSandboxConfig,
}

/// Agent runtime settings (e.g. context window size).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentSection {
    pub max_context_tokens: Option<usize>,
}

/// Configuration for a single external MCP server (HTTP/SSE transport).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct McpServerConfig {
    /// Display name for this server (e.g. "filesystem").
    pub name: String,
    /// SSE endpoint URL (e.g. "http://localhost:3100/sse").
    pub url: String,
    /// Optional Authorization header value (e.g. "Bearer sk-...").
    pub auth_header: Option<String>,
}

/// Bootstrap file injection limits for the system prompt.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct BootstrapConfig {
    /// Max characters per bootstrap file (default: 20 000).
    pub max_chars_per_file: Option<usize>,
    /// Max total characters for all bootstrap files combined (default: 150 000).
    pub max_total_chars: Option<usize>,
}

/// Credentials for connecting to an external knowledge graph endpoint.
/// Stored in `credentials.toml` under `[knowledge_graph]`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct KgCredentials {
    /// Username for Bolt/Cypher (Neo4j, Memgraph) or HTTP Basic auth.
    pub username: Option<String>,
    /// Password for Bolt/Cypher or HTTP Basic auth.
    pub password: Option<String>,
    /// Bearer token for SPARQL endpoints that use API-key auth.
    pub api_key: Option<String>,
}

/// External knowledge graph gateway settings.
///
/// Set `enabled = true` and provide a `uri` to connect to an external KG.
/// The protocol adapter is inferred from the URI scheme:
/// - `bolt://`, `neo4j://`, `neo4j+s://` → Bolt/Cypher (Neo4j, Memgraph, …)
/// - `http://`, `https://`               → SPARQL 1.1 HTTP
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeGraphConfig {
    pub enabled: bool,
    /// Connection URI for the external knowledge graph endpoint.
    /// The URI scheme selects the protocol adapter automatically.
    pub uri: Option<String>,
    pub auto_context: bool,
    pub max_context_facts: u32,
    pub max_extraction_chars: u32,
    pub backfill_on_startup: bool,
    pub extract_from_conversations: bool,
    pub extract_from_memory: bool,
    pub extract_from_documents: bool,
}

impl Default for KnowledgeGraphConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            uri: None,
            auto_context: true,
            max_context_facts: 12,
            max_extraction_chars: 4_000,
            backfill_on_startup: true,
            extract_from_conversations: true,
            extract_from_memory: true,
            extract_from_documents: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub log_level: String,
    pub active_provider: Provider,
    pub profiles: Vec<ProviderProfile>,
    #[serde(default, deserialize_with = "deserialize_optional_nonempty_string")]
    pub default_profile_id: Option<String>,
    pub fallback_profile_ids: Vec<String>,
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub brave_search_endpoint: String,
    pub allowed_chat_ids: Vec<i64>,
    pub ollama: OllamaConfig,
    pub openai: ProviderModelConfig,
    pub anthropic: ProviderModelConfig,
    pub gateway: GatewayConfig,
    pub security: SecurityConfig,
    pub execution: ExecutionConfig,
    pub knowledge_graph: KnowledgeGraphConfig,
    #[serde(default)]
    pub bootstrap: BootstrapConfig,
    #[serde(default)]
    pub agent: AgentSection,
    /// External MCP servers connected via HTTP/SSE.
    /// Tools discovered from these servers are available to all agents automatically.
    #[serde(default)]
    pub mcp_servers: Vec<McpServerConfig>,
}

impl Default for AppConfig {
    fn default() -> Self {
        let home = init::default_home_dir();
        Self {
            host: "0.0.0.0".to_owned(),
            port: 28847,
            log_level: "info".to_owned(),
            active_provider: Provider::Ollama,
            profiles: Vec::new(),
            default_profile_id: None,
            fallback_profile_ids: Vec::new(),
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
            gateway: GatewayConfig::default(),
            security: SecurityConfig::default(),
            execution: ExecutionConfig::default(),
            knowledge_graph: KnowledgeGraphConfig::default(),
            bootstrap: BootstrapConfig::default(),
            agent: AgentSection::default(),
            mcp_servers: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CredentialsConfig {
    pub profiles: HashMap<String, ProfileSecrets>,
    pub openai_api_key: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub brave_api_key: Option<String>,
    /// Gemini API key for image generation.
    pub gemini_api_key: Option<String>,
    pub telegram_bot_token: Option<String>,
    pub discord_bot_token: Option<String>,
    pub slack_bot_token: Option<String>,
    /// Slack Socket Mode app-level token (xapp-...)
    pub slack_app_token: Option<String>,
    /// HMAC-SHA256 API secret (hex-encoded 256-bit key).  Generated on `rushdino init`.
    pub api_secret: Option<String>,
    /// Credentials for the external knowledge graph endpoint.
    #[serde(default)]
    pub knowledge_graph: KgCredentials,
}

impl AppConfig {
    pub fn load() -> Result<Self> {
        let home = init::default_home_dir();
        let config_path = home.join("config.toml");
        Self::load_from_path(&config_path)
    }

    pub fn load_and_reconcile() -> Result<Self> {
        let home = init::canonical_home_dir();
        let config_path = home.join("config.toml");
        let mut config = Self::load_from_path(&config_path)?;
        reconcile_storage_paths(&mut config, &home)?;
        config.save_to_path(&config_path)?;
        Ok(config)
    }

    pub fn load_from_path(path: &Path) -> Result<Self> {
        let mut figment = Figment::from(Serialized::defaults(Self::default()));
        if path.exists() {
            let raw = fs::read_to_string(path)?;
            let normalized = normalize_legacy_config_toml(&raw);
            figment = figment.merge(Toml::string(&normalized));
        }
        let figment = figment.merge(Env::prefixed("RUSHDINO_").split("__"));
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

fn reconcile_storage_paths(config: &mut AppConfig, home: &Path) -> Result<()> {
    let canonical_data_dir = init::canonical_data_dir(home);
    let canonical_db_path = init::canonical_db_path(home);
    let current_data_dir = absolute_from_home(&config.data_dir, home);
    let current_db_path = absolute_from_home(&config.db_path, home);

    let data_outside_home = !is_within_home(&current_data_dir, home);
    let db_outside_home = !is_within_home(&current_db_path, home);
    if !data_outside_home && !db_outside_home {
        return Ok(());
    }

    fs::create_dir_all(&canonical_data_dir)?;
    if data_outside_home {
        for dir in ["agents", "skills", "documents", "memory", "plugins", "logs"] {
            copy_dir_if_missing(&current_data_dir.join(dir), &canonical_data_dir.join(dir))?;
        }
    }

    if db_outside_home && current_db_path.exists() && !canonical_db_path.exists() {
        if let Some(parent) = canonical_db_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(&current_db_path, &canonical_db_path)?;
    }

    config.data_dir = canonical_data_dir;
    config.db_path = canonical_db_path;
    Ok(())
}

fn absolute_from_home(path: &Path, home: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        home.join(path)
    }
}

fn is_within_home(path: &Path, home: &Path) -> bool {
    path.starts_with(home)
}

fn copy_dir_if_missing(src: &Path, dst: &Path) -> Result<()> {
    if !src.exists() || !src.is_dir() {
        return Ok(());
    }

    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_if_missing(&src_path, &dst_path)?;
        } else if !dst_path.exists() {
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

fn normalize_legacy_config_toml(raw: &str) -> String {
    raw.replace("\n[codex]\n", "\n[openai_codex]\n")
}

impl CredentialsConfig {
    pub fn load() -> Result<Self> {
        let home = init::default_home_dir();
        let path = home.join("credentials.toml");
        Ok(Self::load_from_path(&path)?.with_env_fallbacks())
    }

    pub fn load_from_path(path: &Path) -> Result<Self> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let figment = Figment::from(Serialized::defaults(Self::default())).merge(Toml::file(path));
        Ok(figment.extract()?)
    }

    /// Fill in missing credential values from well-known environment variables.
    /// Call this after `load` / `load_from_path` to support `BRAVE_API_KEY`,
    /// `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` env vars as
    /// fallbacks when `credentials.toml` doesn't contain them.
    pub fn with_env_fallbacks(mut self) -> Self {
        let env_fallback = |field: &mut Option<String>, var: &str| {
            if field.as_deref().unwrap_or_default().is_empty() {
                if let Ok(val) = std::env::var(var) {
                    if !val.is_empty() {
                        *field = Some(val);
                    }
                }
            }
        };
        env_fallback(&mut self.brave_api_key, "BRAVE_API_KEY");
        env_fallback(&mut self.openai_api_key, "OPENAI_API_KEY");
        env_fallback(&mut self.anthropic_api_key, "ANTHROPIC_API_KEY");
        env_fallback(&mut self.gemini_api_key, "GEMINI_API_KEY");
        self
    }

    pub fn save_to_path(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let serialized = toml::to_string(self).map_err(|e| {
            crate::AppError::Validation(format!("failed to serialize credentials: {e}"))
        })?;
        let tmp_path = path.with_extension("tmp");
        fs::write(&tmp_path, serialized)?;
        fs::rename(tmp_path, path)?;
        Ok(())
    }
}

fn deserialize_optional_nonempty_string<'de, D>(
    deserializer: D,
) -> std::result::Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    Ok(value.and_then(|s| {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_owned())
        }
    }))
}
