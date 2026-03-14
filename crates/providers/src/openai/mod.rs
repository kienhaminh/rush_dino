pub mod completions;
pub mod responses;
pub mod responses_shared;

use tokio::sync::mpsc;

use rushdino_common::Result;

use crate::types::{ChatChunk, ChatRequest, ChatResponse};

use completions::{CompletionsProvider, CompletionsStreamOptions};
use responses::{ResponsesProvider, ResponsesStreamOptions};

#[derive(Clone)]
pub struct OpenAIHybridProvider {
    completions: CompletionsProvider,
    responses: ResponsesProvider,
    default_model: String,
}

impl OpenAIHybridProvider {
    pub fn new(base_url: String, model: String, api_key: Option<String>) -> Self {
        let base_url = base_url.trim().to_owned();
        let model = model.trim().to_owned();
        let provider_hint = Some("openai".to_owned());
        let is_reasoning_model = model.starts_with('o') || model.contains("pro") || model.contains("reason");

        Self {
            completions: CompletionsProvider::new(
                base_url.clone(),
                model.clone(),
                api_key.clone(),
                provider_hint.clone(),
            ),
            responses: ResponsesProvider::new(
                base_url,
                model.clone(),
                api_key,
                provider_hint,
                is_reasoning_model,
            ),
            default_model: model,
        }
    }

    fn use_responses_for_model(model: &str) -> bool {
        let model = model.trim();
        model.starts_with("gpt-5") || model.starts_with('o') || model.contains("codex")
    }

    pub async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        let model = request
            .model
            .as_deref()
            .unwrap_or(self.default_model.as_str());
        if Self::use_responses_for_model(model) {
            self.responses.chat(request).await
        } else {
            self.completions.chat(request).await
        }
    }

    pub async fn stream_chat(&self, request: ChatRequest) -> Result<mpsc::Receiver<ChatChunk>> {
        let model = request
            .model
            .as_deref()
            .unwrap_or(self.default_model.as_str());
        if Self::use_responses_for_model(model) {
            self.responses
                .stream_chat(request, ResponsesStreamOptions::default())
                .await
        } else {
            self.completions
                .stream_chat(request, CompletionsStreamOptions::default())
                .await
        }
    }

    pub fn model(&self) -> &str {
        self.default_model.as_str()
    }
}
