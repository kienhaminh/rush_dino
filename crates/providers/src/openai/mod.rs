pub mod codex_responses;
pub mod completions;
pub mod responses;
pub mod responses_shared;

use tokio::sync::mpsc;

use rushdino_common::Result;

use crate::types::{ChatChunk, ChatRequest, ChatResponse, OpenAIAuth};

use codex_responses::CodexResponsesProvider;
use completions::{CompletionsProvider, CompletionsStreamOptions};
use responses::{ResponsesProvider, ResponsesStreamOptions};

/// Internal routing backend for OpenAI requests.
#[derive(Clone)]
enum OpenAIBackend {
    /// Standard OpenAI API key — routes to `https://api.openai.com/v1`.
    ApiKey {
        completions: CompletionsProvider,
        responses: ResponsesProvider,
    },
    /// Codex OAuth token — routes to `https://chatgpt.com/backend-api/codex/responses`.
    Codex(CodexResponsesProvider),
}

#[derive(Clone)]
pub struct OpenAIHybridProvider {
    backend: OpenAIBackend,
    default_model: String,
}

impl OpenAIHybridProvider {
    pub fn new(base_url: String, model: String, auth: OpenAIAuth) -> Self {
        let model = model.trim().to_owned();
        match auth {
            OpenAIAuth::ApiKey { api_key } => {
                let base_url = base_url.trim().to_owned();
                let provider_hint = Some("openai".to_owned());
                let is_reasoning_model =
                    model.starts_with('o') || model.contains("pro") || model.contains("reason");
                Self {
                    backend: OpenAIBackend::ApiKey {
                        completions: CompletionsProvider::new(
                            base_url.clone(),
                            model.clone(),
                            Some(api_key.clone()),
                            provider_hint.clone(),
                        ),
                        responses: ResponsesProvider::new(
                            base_url,
                            model.clone(),
                            Some(api_key),
                            provider_hint,
                            is_reasoning_model,
                        ),
                    },
                    default_model: model,
                }
            }
            OpenAIAuth::Codex { access_token } => Self {
                backend: OpenAIBackend::Codex(CodexResponsesProvider::new(
                    model.clone(),
                    access_token,
                )),
                default_model: model,
            },
        }
    }

    fn use_responses_for_model(model: &str) -> bool {
        let model = model.trim();
        model.starts_with("gpt-5") || model.starts_with('o') || model.contains("codex")
    }

    pub async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        match &self.backend {
            OpenAIBackend::Codex(p) => p.chat(request).await,
            OpenAIBackend::ApiKey { completions, responses } => {
                let model = request
                    .model
                    .as_deref()
                    .unwrap_or(self.default_model.as_str());
                if Self::use_responses_for_model(model) {
                    responses.chat(request).await
                } else {
                    completions.chat(request).await
                }
            }
        }
    }

    pub async fn stream_chat(&self, request: ChatRequest) -> Result<mpsc::Receiver<ChatChunk>> {
        match &self.backend {
            OpenAIBackend::Codex(p) => p.stream_chat(request).await,
            OpenAIBackend::ApiKey { completions, responses } => {
                let model = request
                    .model
                    .as_deref()
                    .unwrap_or(self.default_model.as_str());
                if Self::use_responses_for_model(model) {
                    responses
                        .stream_chat(request, ResponsesStreamOptions::default())
                        .await
                } else {
                    completions
                        .stream_chat(request, CompletionsStreamOptions::default())
                        .await
                }
            }
        }
    }

    pub fn model(&self) -> &str {
        self.default_model.as_str()
    }
}
