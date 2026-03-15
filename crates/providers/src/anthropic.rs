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
            model: model.trim().to_owned(),
            api_key: api_key.trim().to_owned(),
        }
    }

    pub async fn chat(&self, mut request: ChatRequest) -> Result<ChatResponse> {
        let model = request.model.take().unwrap_or_else(|| self.model.clone());
        let body = to_anthropic_body(request, model, false);

        tracing::debug!(body = %serde_json::to_string_pretty(&body).unwrap_or_default(), "anthropic chat request");

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

        tracing::debug!(body = %serde_json::to_string_pretty(&body).unwrap_or_default(), "anthropic stream_chat request");

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

            // Accumulate streaming tool call inputs keyed by index.
            // Anthropic sends: content_block_start (type=tool_use, id, name)
            //                  content_block_delta (type=input_json_delta, partial_json)
            //                  content_block_stop
            let mut pending_tools: Vec<ToolCall> = Vec::new();

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
                    let Ok(value) = serde_json::from_str::<Value>(data) else {
                        continue;
                    };

                    let event_type = value.get("type").and_then(Value::as_str).unwrap_or("");

                    match event_type {
                        "content_block_start" => {
                            if value.pointer("/content_block/type").and_then(Value::as_str)
                                == Some("tool_use")
                            {
                                let id = value
                                    .pointer("/content_block/id")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_owned();
                                let name = value
                                    .pointer("/content_block/name")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_owned();
                                pending_tools.push(ToolCall {
                                    id,
                                    name,
                                    arguments: json!({}),
                                });
                            }
                        }
                        "content_block_delta" => {
                            let index =
                                value.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                            // Text delta
                            if let Some(text) = value.pointer("/delta/text").and_then(Value::as_str)
                            {
                                let _ = tx
                                    .send(ChatChunk {
                                        delta: text.to_owned(),
                                        tool_calls: Vec::new(),
                                        done: false,
                                        usage: None,
                                        thinking_delta: None,
                                    })
                                    .await;
                            }
                            // Thinking delta (extended thinking)
                            if let Some(thinking) =
                                value.pointer("/delta/thinking").and_then(Value::as_str)
                            {
                                let _ = tx
                                    .send(ChatChunk {
                                        delta: String::new(),
                                        tool_calls: Vec::new(),
                                        done: false,
                                        usage: None,
                                        thinking_delta: Some(thinking.to_owned()),
                                    })
                                    .await;
                            }
                            // Tool input delta — append partial JSON string
                            if let Some(partial) =
                                value.pointer("/delta/partial_json").and_then(Value::as_str)
                            {
                                // Find the pending tool whose content_block index matches.
                                // Anthropic uses a global content block index; tool blocks
                                // start after any text blocks so we track by insertion order.
                                if let Some(tool) = pending_tools.last_mut() {
                                    // Re-use the arguments field as a raw JSON string buffer.
                                    if let Some(s) = tool.arguments.as_str() {
                                        tool.arguments = json!(format!("{s}{partial}"));
                                    } else {
                                        tool.arguments = json!(partial);
                                    }
                                    let _ = index; // index verified via insertion order
                                }
                            }
                        }
                        "content_block_stop" => {
                            // Finalize the last pending tool call: parse accumulated JSON string.
                            if let Some(tool) = pending_tools.last_mut() {
                                if let Some(raw) = tool.arguments.as_str() {
                                    if let Ok(parsed) = serde_json::from_str::<Value>(raw) {
                                        tool.arguments = parsed;
                                    }
                                }
                            }
                        }
                        "message_delta" => {
                            // Emit accumulated tool calls once the message is finishing.
                            if !pending_tools.is_empty() {
                                let calls = std::mem::take(&mut pending_tools);
                                let _ = tx
                                    .send(ChatChunk {
                                        delta: String::new(),
                                        tool_calls: calls,
                                        done: false,
                                        usage: None,
                                        thinking_delta: None,
                                    })
                                    .await;
                            }
                        }
                        _ => {}
                    }
                }
            }

            // Flush any remaining tool calls in case message_delta was not received.
            if !pending_tools.is_empty() {
                let _ = tx
                    .send(ChatChunk {
                        delta: String::new(),
                        tool_calls: pending_tools,
                        done: false,
                        usage: None,
                        thinking_delta: None,
                    })
                    .await;
            }

            let _ = tx
                .send(ChatChunk {
                    delta: String::new(),
                    tool_calls: Vec::new(),
                    done: true,
                    usage: None,
                    thinking_delta: None,
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

    let thinking_budget = request
        .thinking_level
        .as_ref()
        .and_then(|l| l.anthropic_budget_tokens());

    let mut body = json!({
        "model": model,
        "system": system,
        "messages": messages,
        "tools": tools,
        "max_tokens": request.max_tokens.unwrap_or(1024),
        "stream": stream,
    });

    if let Some(budget) = thinking_budget {
        // Extended thinking requires temperature=1
        body["thinking"] = json!({ "type": "enabled", "budget_tokens": budget });
        body["temperature"] = json!(1);
    } else {
        body["temperature"] = json!(request.temperature);
    }

    body
}
