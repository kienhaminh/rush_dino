mod anthropic;
mod openai;
mod plugin;
pub mod types;

use tokio::sync::mpsc;

use rushdino_common::{AppError, Result};
use types::{ChatChunk, ChatRequest, ChatResponse, ProviderConfig};

pub use anthropic::AnthropicProvider;
pub use openai::codex_refresh;
pub use openai::OpenAIProvider;
pub use plugin::PluginProvider;

#[derive(Clone)]
pub enum Provider {
    Ollama(OpenAIProvider),
    OpenAI(OpenAIProvider),
    Anthropic(AnthropicProvider),
    Codex(OpenAIProvider),
    Plugin(PluginProvider),
}

impl Provider {
    pub fn from_config(config: &ProviderConfig) -> Result<Self> {
        match config {
            ProviderConfig::Ollama {
                base_url,
                model,
                api_key,
            } => Ok(Self::Ollama(OpenAIProvider::new(
                base_url.clone(),
                model.clone(),
                api_key.clone(),
            ))),
            ProviderConfig::OpenAI {
                base_url,
                model,
                api_key,
            } => Ok(Self::OpenAI(OpenAIProvider::new(
                base_url
                    .clone()
                    .unwrap_or_else(|| "https://api.openai.com/v1".to_owned()),
                model.clone(),
                Some(api_key.clone()),
            ))),
            ProviderConfig::Anthropic { model, api_key } => {
                Ok(Self::Anthropic(AnthropicProvider::new(model.clone(), api_key.clone())))
            }
            ProviderConfig::Codex { access_token, model } => Ok(Self::Codex(OpenAIProvider::new(
                "https://api.openai.com/v1".to_owned(),
                model.clone(),
                Some(access_token.clone()),
            ))),
            ProviderConfig::Plugin { manifest_path } => {
                Ok(Self::Plugin(PluginProvider::from_manifest(manifest_path)?))
            }
        }
    }

    pub async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        match self {
            Self::Ollama(p) | Self::OpenAI(p) | Self::Codex(p) => p.chat(request).await,
            Self::Anthropic(p) => p.chat(request).await,
            Self::Plugin(p) => p.chat(request).await,
        }
    }

    pub async fn stream_chat(&self, request: ChatRequest) -> Result<mpsc::Receiver<ChatChunk>> {
        match self {
            Self::Ollama(p) | Self::OpenAI(p) | Self::Codex(p) => p.stream_chat(request).await,
            Self::Anthropic(p) => p.stream_chat(request).await,
            Self::Plugin(p) => p.stream_chat(request).await,
        }
    }

    pub fn model(&self) -> &str {
        match self {
            Self::Ollama(p) | Self::OpenAI(p) | Self::Codex(p) => &p.model,
            Self::Anthropic(p) => &p.model,
            Self::Plugin(p) => &p.name,
        }
    }

    pub fn ensure_key(label: &str, key: &Option<String>) -> Result<()> {
        if key.as_deref().unwrap_or_default().is_empty() {
            return Err(AppError::Provider(format!("missing API key for {label}")));
        }
        Ok(())
    }
}
