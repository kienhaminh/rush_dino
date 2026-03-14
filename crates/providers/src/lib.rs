mod anthropic;
pub mod catalog;
mod openai;
pub mod types;

use tokio::sync::mpsc;

use rushdino_common::{config::Provider as ProviderKind, AppError, Result};
use types::{ChatChunk, ChatRequest, ChatResponse, ModelInfo, ProviderConfig};

pub use anthropic::AnthropicProvider;
pub use openai::completions::CompletionsProvider;
pub use openai::OpenAIHybridProvider;

/// Backward-compat alias — other crates import `rushdino_providers::Provider`.
pub type Provider = ProviderService;

#[derive(Clone)]
pub enum ProviderService {
    Ollama(CompletionsProvider),
    OpenAI(OpenAIHybridProvider),
    Anthropic(AnthropicProvider),
}

impl ProviderService {
    pub fn from_config(config: &ProviderConfig) -> Result<Self> {
        match config {
            ProviderConfig::Ollama {
                base_url,
                model,
                api_key,
            } => Ok(Self::Ollama(CompletionsProvider::new(
                base_url.clone(),
                model.clone(),
                api_key.clone(),
                Some("ollama".to_owned()),
            ))),
            ProviderConfig::OpenAI {
                base_url,
                model,
                api_key,
            } => {
                let base_url = base_url
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .unwrap_or("https://api.openai.com/v1")
                    .to_owned();
                Ok(Self::OpenAI(OpenAIHybridProvider::new(
                    base_url,
                    model.clone(),
                    Some(api_key.clone()),
                )))
            }
            ProviderConfig::Anthropic { model, api_key } => Ok(Self::Anthropic(
                AnthropicProvider::new(model.clone(), api_key.clone()),
            )),
        }
    }

    pub async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        let tool_names: Vec<&str> = request
            .tools
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(|t| t.name.as_str())
            .collect();
        tracing::debug!(
            model = self.model(),
            messages = request.messages.len(),
            tools = ?tool_names,
            "provider chat request"
        );

        let response = match self {
            Self::Ollama(p) => p.chat(request).await,
            Self::OpenAI(p) => p.chat(request).await,
            Self::Anthropic(p) => p.chat(request).await,
        }?;

        tracing::debug!(
            tool_calls = response.tool_calls.len(),
            tool_call_names = ?response.tool_calls.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            content_len = response.content.len(),
            "provider chat response"
        );

        Ok(response)
    }

    pub async fn stream_chat(&self, request: ChatRequest) -> Result<mpsc::Receiver<ChatChunk>> {
        match self {
            Self::Ollama(p) => {
                p.stream_chat(request, openai::completions::CompletionsStreamOptions::default())
                    .await
            }
            Self::OpenAI(p) => p.stream_chat(request).await,
            Self::Anthropic(p) => p.stream_chat(request).await,
        }
    }

    pub async fn list_models(&self) -> Result<Vec<ModelInfo>> {
        let kind = match self {
            Self::Ollama(_) => ProviderKind::Ollama,
            Self::OpenAI(_) => ProviderKind::OpenAI,
            Self::Anthropic(_) => ProviderKind::Anthropic,
        };
        Ok(catalog::get_static_models(kind))
    }

    pub fn model(&self) -> &str {
        match self {
            Self::Ollama(p) => &p.model,
            Self::OpenAI(p) => p.model(),
            Self::Anthropic(p) => &p.model,
        }
    }

    pub fn ensure_key(label: &str, key: &Option<String>) -> Result<()> {
        if key.as_deref().unwrap_or_default().is_empty() {
            return Err(AppError::Provider(format!("missing API key for {label}")));
        }
        Ok(())
    }
}
