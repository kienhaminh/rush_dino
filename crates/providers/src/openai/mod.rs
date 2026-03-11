use futures::StreamExt;
use reqwest::Client;
use serde_json::{json, Value};
use tokio::sync::mpsc;

use rushdino_common::{AppError, Result};

use crate::types::{ChatChunk, ChatRequest, ChatResponse};

use self::mapping::{
    map_openai_message, map_openai_tools, parse_openai_response,
};

pub mod codex_refresh;
pub mod codex_responses;
mod mapping;

#[derive(Clone)]
pub struct OpenAIProvider {
    client: Client,
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
}

impl OpenAIProvider {
    pub fn new(base_url: String, model: String, api_key: Option<String>) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.trim().to_owned(),
            model: model.trim().to_owned(),
            api_key: api_key.map(|k| k.trim().to_owned()),
        }
    }

    pub async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        let model = request.model.unwrap_or_else(|| self.model.clone());
        let body = json!({
            "model": model,
            "messages": request.messages.iter().map(map_openai_message).collect::<Vec<_>>(),
            "tools": request.tools.map(map_openai_tools),
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        });

        let mut req = self
            .client
            .post(format!(
                "{}/chat/completions",
                self.base_url.trim_end_matches('/')
            ))
            .json(&body)
            .timeout(std::time::Duration::from_secs(60));

        if let Some(key) = &self.api_key {
            if !key.is_empty() {
                req = req.bearer_auth(key);
            }
        }

        let payload: Value = req
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("openai request failed: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Provider(format!("openai status error: {e}")))?
            .json()
            .await
            .map_err(|e| AppError::Provider(format!("openai parse error: {e}")))?;

        parse_openai_response(&payload)
    }

    pub async fn stream_chat(&self, request: ChatRequest) -> Result<mpsc::Receiver<ChatChunk>> {
        let (tx, rx) = mpsc::channel(128);
        let model = request.model.clone().unwrap_or_else(|| self.model.clone());
        let body = json!({
            "model": model,
            "messages": request.messages.iter().map(map_openai_message).collect::<Vec<_>>(),
            "tools": request.tools.map(map_openai_tools),
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "stream": true,
        });

        tracing::debug!(body = %serde_json::to_string_pretty(&body).unwrap_or_default(), "openai stream_chat request");

        let mut req = self
            .client
            .post(format!(
                "{}/chat/completions",
                self.base_url.trim_end_matches('/')
            ))
            .json(&body)
            .timeout(std::time::Duration::from_secs(60));

        if let Some(key) = &self.api_key {
            if !key.is_empty() {
                req = req.bearer_auth(key);
            }
        }

        let response = req
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("openai stream request failed: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Provider(format!("openai stream status error: {e}")))?;

        tokio::spawn(async move {
            let mut stream = response.bytes_stream();
            let mut buffer = String::new();
            // Accumulate streaming tool call deltas by index.
            // OpenAI sends the id+name in the first delta and argument fragments
            // in subsequent deltas — each with the same index but no name.
            let mut pending: std::collections::HashMap<usize, (String, String, String)> =
                std::collections::HashMap::new();

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
                    if data == "[DONE]" {
                        // Emit all completed tool calls before signalling done.
                        let mut completed: Vec<_> = pending.drain().collect();
                        completed.sort_by_key(|(index, _)| *index);
                        let tool_calls = completed
                            .into_iter()
                            .filter_map(|(_, (id, name, args_str))| {
                                if name.is_empty() {
                                    return None;
                                }
                                let arguments =
                                    serde_json::from_str(&args_str).unwrap_or_else(|_| json!({}));
                                Some(rushdino_common::models::ToolCall { id, name, arguments })
                            })
                            .collect::<Vec<_>>();
                        let _ = tx
                            .send(ChatChunk {
                                delta: String::new(),
                                tool_calls,
                                done: true,
                            })
                            .await;
                        return;
                    }

                    if let Ok(value) = serde_json::from_str::<Value>(data) {
                        let delta = value
                            .pointer("/choices/0/delta/content")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_owned();

                        // Merge streaming tool call deltas into pending map.
                        if let Some(Value::Array(calls)) =
                            value.pointer("/choices/0/delta/tool_calls")
                        {
                            for call in calls {
                                let Some(index) = call.get("index").and_then(Value::as_u64) else {
                                    continue;
                                };
                                let index = index as usize;
                                let entry = pending.entry(index).or_insert_with(|| {
                                    let id = call
                                        .get("id")
                                        .and_then(Value::as_str)
                                        .unwrap_or_default()
                                        .to_owned();
                                    let name = call
                                        .pointer("/function/name")
                                        .and_then(Value::as_str)
                                        .unwrap_or_default()
                                        .to_owned();
                                    (id, name, String::new())
                                });
                                if let Some(args_delta) = call
                                    .pointer("/function/arguments")
                                    .and_then(Value::as_str)
                                {
                                    entry.2.push_str(args_delta);
                                }
                            }
                        }

                        if !delta.is_empty() {
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
