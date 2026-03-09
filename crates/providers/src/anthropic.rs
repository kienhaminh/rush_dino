use futures::StreamExt;
use reqwest::Client;
use serde_json::{json, Value};
use tokio::sync::mpsc;

use rushdino_common::{models::ToolCall, AppError, Result};

use crate::types::{ChatChunk, ChatRequest, ChatResponse};

#[derive(Clone)]
pub struct AnthropicProvider {
    client: Client,
    pub model: String,
    api_key: String,
}

impl AnthropicProvider {
    pub fn new(model: String, api_key: String) -> Self {
        Self {
            client: Client::new(),
            model,
            api_key,
        }
    }

    pub async fn chat(&self, mut request: ChatRequest) -> Result<ChatResponse> {
        let model = request.model.take().unwrap_or_else(|| self.model.clone());
        let body = to_anthropic_body(request, model, false);

        let payload: Value = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("anthropic request failed: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Provider(format!("anthropic status error: {e}")))?
            .json()
            .await
            .map_err(|e| AppError::Provider(format!("anthropic parse error: {e}")))?;

        let mut content = String::new();
        let mut tool_calls = Vec::new();
        if let Some(arr) = payload.get("content").and_then(Value::as_array) {
            for item in arr {
                if item.get("type").and_then(Value::as_str) == Some("text") {
                    content.push_str(item.get("text").and_then(Value::as_str).unwrap_or_default());
                }
                if item.get("type").and_then(Value::as_str) == Some("tool_use") {
                    tool_calls.push(ToolCall {
                        id: item
                            .get("id")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_owned(),
                        name: item
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_owned(),
                        arguments: item.get("input").cloned().unwrap_or_else(|| json!({})),
                    });
                }
            }
        }

        Ok(ChatResponse {
            content,
            tool_calls,
            rich_content: None,
            usage: None,
            finish_reason: payload
                .get("stop_reason")
                .and_then(Value::as_str)
                .unwrap_or("stop")
                .to_owned(),
        })
    }

    pub async fn stream_chat(&self, request: ChatRequest) -> Result<mpsc::Receiver<ChatChunk>> {
        let (tx, rx) = mpsc::channel(128);
        let model = request.model.clone().unwrap_or_else(|| self.model.clone());
        let body = to_anthropic_body(request, model, true);

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("anthropic stream request failed: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Provider(format!("anthropic stream status error: {e}")))?;

        tokio::spawn(async move {
            let mut stream = response.bytes_stream();
            let mut buffer = String::new();
            while let Some(item) = stream.next().await {
                let Ok(chunk) = item else {
                    break;
                };
                buffer.push_str(&String::from_utf8_lossy(&chunk));

                while let Some(idx) = buffer.find('\n') {
                    let line = buffer[..idx].trim().to_owned();
                    buffer = buffer[idx + 1..].to_owned();

                    if !line.starts_with("data:") {
                        continue;
                    }
                    let data = line.trim_start_matches("data:").trim();
                    if data.is_empty() {
                        continue;
                    }
                    if let Ok(value) = serde_json::from_str::<Value>(data) {
                        let delta = value
                            .pointer("/delta/text")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_owned();
                        let _ = tx
                            .send(ChatChunk {
                                delta,
                                tool_calls: Vec::new(),
                                done: false,
                            })
                            .await;
                    }
                }
            }

            let _ = tx
                .send(ChatChunk {
                    delta: String::new(),
                    tool_calls: Vec::new(),
                    done: true,
                })
                .await;
        });

        Ok(rx)
    }
}

fn to_anthropic_body(request: ChatRequest, model: String, stream: bool) -> Value {
    let system = request
        .messages
        .iter()
        .filter(|m| matches!(m.role, rushdino_common::models::Role::System))
        .map(|m| m.content.clone())
        .collect::<Vec<_>>()
        .join("\n\n");

    let messages = request
        .messages
        .into_iter()
        .filter(|m| !matches!(m.role, rushdino_common::models::Role::System))
        .map(|m| {
            let role = if matches!(m.role, rushdino_common::models::Role::Assistant) {
                "assistant"
            } else {
                "user"
            };
            json!({ "role": role, "content": m.content })
        })
        .collect::<Vec<_>>();

    let tools = request.tools.map(|defs| {
        defs.into_iter()
            .map(|t| {
                json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters,
                })
            })
            .collect::<Vec<_>>()
    });

    json!({
        "model": model,
        "system": system,
        "messages": messages,
        "tools": tools,
        "temperature": request.temperature,
        "max_tokens": request.max_tokens.unwrap_or(1024),
        "stream": stream,
    })
}
