use std::collections::HashSet;
use std::time::Duration;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use reqwest::Client;
use serde_json::{json, Value};
use tokio::sync::mpsc;

use rushdino_common::{AppError, Result};

use crate::types::{ChatChunk, ChatRequest, ChatResponse};

use super::responses_shared::{
    convert_responses_messages, convert_responses_tools, process_responses_stream,
    ConvertResponsesMessagesOptions,
};

const CODEX_URL: &str = "https://chatgpt.com/backend-api/codex/responses";
const JWT_AUTH_CLAIM: &str = "https://api.openai.com/auth";

fn codex_tool_call_providers() -> HashSet<String> {
    ["openai", "openai-codex", "opencode"]
        .iter()
        .map(|s| s.to_string())
        .collect()
}

fn extract_account_id(token: &str) -> Result<String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(AppError::Provider(
            "Failed to extract accountId from token: invalid token format".to_owned(),
        ));
    }

    let decoded = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| AppError::Provider("Failed to extract accountId from token".to_owned()))?;

    let payload: Value = serde_json::from_slice(&decoded)
        .map_err(|_| AppError::Provider("Failed to extract accountId from token".to_owned()))?;

    payload
        .get(JWT_AUTH_CLAIM)
        .and_then(|v| v.get("chatgpt_account_id"))
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| {
            AppError::Provider("Failed to extract accountId from token".to_owned())
        })
}

#[derive(Clone)]
pub struct CodexResponsesProvider {
    client: Client,
    pub model: String,
    pub access_token: String,
}

impl CodexResponsesProvider {
    pub fn new(model: String, access_token: String) -> Self {
        Self {
            client: Client::new(),
            model: model.trim().to_owned(),
            access_token: access_token.trim().to_owned(),
        }
    }

    pub async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        let mut rx = self.stream_chat(request).await?;
        let mut content = String::new();
        let mut tool_calls = Vec::new();

        while let Some(chunk) = rx.recv().await {
            content.push_str(&chunk.delta);
            tool_calls.extend(chunk.tool_calls);
            if chunk.done {
                break;
            }
        }

        Ok(ChatResponse {
            content,
            tool_calls,
            rich_content: None,
            usage: None,
            finish_reason: "stop".to_owned(),
        })
    }

    pub async fn stream_chat(&self, request: ChatRequest) -> Result<mpsc::Receiver<ChatChunk>> {
        let account_id = extract_account_id(&self.access_token)?;
        let (tx, rx) = mpsc::channel(128);

        let allowed_providers = codex_tool_call_providers();
        let model_id = request.model.clone().unwrap_or_else(|| self.model.clone());

        let system_prompt: Option<String> = request
            .messages
            .iter()
            .find(|m| m.role == rushdino_common::models::Role::System)
            .map(|m| m.content.clone());

        let conversation: Vec<rushdino_common::models::Message> = request
            .messages
            .into_iter()
            .filter(|m| m.role != rushdino_common::models::Role::System)
            .collect();

        let opts = ConvertResponsesMessagesOptions {
            include_system_prompt: false,
        };
        let messages = convert_responses_messages(
            &conversation,
            system_prompt.as_deref(),
            false,
            false,
            &allowed_providers,
            "openai-codex",
            &opts,
        );

        let is_reasoning = request
            .thinking_level
            .as_ref()
            .and_then(|l| l.openai_reasoning_effort())
            .is_some();

        let mut body = json!({
            "model": model_id,
            "store": false,
            "stream": true,
            "instructions": system_prompt,
            "input": messages,
            "text": { "verbosity": "medium" },
            "include": ["reasoning.encrypted_content"],
            "tool_choice": "auto",
            "parallel_tool_calls": true,
        });

        if let Some(tools) = &request.tools {
            body["tools"] = json!(convert_responses_tools(tools, None));
        }

        if is_reasoning {
            let effort = request
                .thinking_level
                .as_ref()
                .and_then(|l| l.openai_reasoning_effort())
                .unwrap_or("medium");
            body["reasoning"] = json!({ "effort": effort, "summary": "auto" });
        }

        let client = self.client.clone();
        let access_token = self.access_token.clone();

        tokio::spawn(async move {
            let response = match client
                .post(CODEX_URL)
                .bearer_auth(&access_token)
                .header("chatgpt-account-id", &account_id)
                .header("OpenAI-Beta", "responses=experimental")
                .header("originator", "pi")
                .header("accept", "text/event-stream")
                .json(&body)
                .timeout(Duration::from_secs(300))
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    let _ = tx
                        .send(ChatChunk {
                            delta: format!("Request failed: {e}"),
                            tool_calls: vec![],
                            done: true,
                            usage: None,
                            thinking_delta: None,
                        })
                        .await;
                    return;
                }
            };

            if !response.status().is_success() {
                let status = response.status();
                let body_text = response.text().await.unwrap_or_default();
                let _ = tx
                    .send(ChatChunk {
                        delta: format!("HTTP {status}: {body_text}"),
                        tool_calls: vec![],
                        done: true,
                        usage: None,
                        thinking_delta: None,
                    })
                    .await;
                return;
            }

            process_responses_stream(response, tx).await;
        });

        Ok(rx)
    }
}
