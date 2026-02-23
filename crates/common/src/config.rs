use std::path::{Path, PathBuf};

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
}

impl Default for AppConfig {
    fn default() -> Self {
        let home = init::default_home_dir();
        Self {
            host: "127.0.0.1".to_owned(),
            port: 3000,
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
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CredentialsConfig {
    pub openai_api_key: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub brave_api_key: Option<String>,
    pub telegram_bot_token: Option<String>,
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
}
