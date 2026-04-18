use futures::StreamExt;
use reqwest::{Client, RequestBuilder};
use serde_json::{json, Value};
use tokio::sync::mpsc;

use rushdino_common::{models::ToolCall, AppError, Result};

use crate::types::{AnthropicAuth, ChatChunk, ChatRequest, ChatResponse, ThinkingLevel, Usage};

#[derive(Clone)]
pub struct AnthropicProvider {
    client: Client,
    pub model: String,
    auth: AnthropicAuth,
}

impl AnthropicProvider {
    pub fn new(model: String, auth: AnthropicAuth) -> Self {
        let auth = match auth {
            AnthropicAuth::ApiKey { api_key } => AnthropicAuth::ApiKey { api_key: api_key.trim().to_owned() },
            AnthropicAuth::OAuth { access_token } => AnthropicAuth::OAuth { access_token: access_token.trim().to_owned() },
        };
        Self {
            client: Client::new(),
            model: model.trim().to_owned(),
            auth,
        }
    }

    /// Applies the correct authentication headers based on auth method.
    /// OAuth requires Bearer token + specific beta flags + Claude Code identity headers.
    fn authenticate(&self, req: RequestBuilder) -> RequestBuilder {
        match &self.auth {
            AnthropicAuth::ApiKey { api_key } => req.header("x-api-key", api_key),
            AnthropicAuth::OAuth { access_token } => req
                .bearer_auth(access_token)
                .header(
                    "anthropic-beta",
                    "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14",
                )
                .header("user-agent", "claude-cli/1.0.0")
                .header("x-app", "cli"),
        }
    }

    fn is_oauth(&self) -> bool {
        matches!(self.auth, AnthropicAuth::OAuth { .. })
    }

    pub async fn chat(&self, mut request: ChatRequest) -> Result<ChatResponse> {
        let model = request.model.take().unwrap_or_else(|| self.model.clone());
        let body = to_anthropic_body(request, model, false, self.is_oauth());

        tracing::debug!(model = %body["model"].as_str().unwrap_or("unknown"), "anthropic chat request");

        let call_start = std::time::Instant::now();
        let response = self
            .authenticate(self.client.post("https://api.anthropic.com/v1/messages"))
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("anthropic request failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_body = response.text().await.unwrap_or_default();
            return Err(AppError::Provider(format!(
                "anthropic status error: HTTP {status}: {err_body}"
            )));
        }

        let payload: Value = response
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

        let usage = parse_anthropic_usage(&payload);
        let total_ms = Some(call_start.elapsed().as_millis() as i64);

        Ok(ChatResponse {
            content,
            tool_calls,
            rich_content: None,
            usage,
            finish_reason: payload
                .get("stop_reason")
                .and_then(Value::as_str)
                .unwrap_or("stop")
                .to_owned(),
            total_ms,
            ttft_ms: None,
        })
    }

    pub async fn stream_chat(&self, request: ChatRequest) -> Result<mpsc::Receiver<ChatChunk>> {
        let (tx, rx) = mpsc::channel(128);
        let model = request.model.clone().unwrap_or_else(|| self.model.clone());
        let body = to_anthropic_body(request, model, true, self.is_oauth());

        tracing::debug!(model = %body["model"].as_str().unwrap_or("unknown"), "anthropic stream_chat request");

        let call_start = std::time::Instant::now();
        let response = self
            .authenticate(self.client.post("https://api.anthropic.com/v1/messages"))
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("anthropic stream request failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_body = response.text().await.unwrap_or_default();
            return Err(AppError::Provider(format!(
                "anthropic stream error: HTTP {status}: {err_body}"
            )));
        }

        tokio::spawn(async move {
            let mut stream = response.bytes_stream();
            let mut buffer = String::new();

            // Accumulate streaming tool call inputs keyed by index.
            // Anthropic sends: content_block_start (type=tool_use, id, name)
            //                  content_block_delta (type=input_json_delta, partial_json)
            //                  content_block_stop
            let mut pending_tools: Vec<ToolCall> = Vec::new();
            let mut input_tokens: u32 = 0;
            let mut output_tokens: u32 = 0;
            // Track time-to-first-token (ms from request sent to first text/tool delta received).
            let mut ttft_ms: Option<i64> = None;

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
                        "message_start" => {
                            // Anthropic sends input_tokens in message_start.message.usage
                            if let Some(u) = value.pointer("/message/usage") {
                                input_tokens += u.get("input_tokens").and_then(Value::as_u64).unwrap_or(0) as u32;
                            }
                        }
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
                                // Record time-to-first-text-token (thinking deltas are excluded intentionally).
                                if ttft_ms.is_none() {
                                    ttft_ms = Some(call_start.elapsed().as_millis() as i64);
                                }
                                let _ = tx
                                    .send(ChatChunk {
                                        delta: text.to_owned(),
                                        tool_calls: Vec::new(),
                                        done: false,
                                        usage: None,
                                        thinking_delta: None,
                                        total_ms: None,
                                        ttft_ms: None,
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
                                        total_ms: None,
                                        ttft_ms: None,
                                    })
                                    .await;
                            }
                            // Tool input delta — append partial JSON string
                            if let Some(partial) =
                                value.pointer("/delta/partial_json").and_then(Value::as_str)
                            {
                                // Route by the Anthropic content block index so that
                                // interleaved tool calls each accumulate their own JSON.
                                append_tool_partial(&mut pending_tools, index, partial);
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
                            // Anthropic sends output_tokens in message_delta.usage
                            if let Some(u) = value.get("usage") {
                                output_tokens += u.get("output_tokens").and_then(Value::as_u64).unwrap_or(0) as u32;
                            }
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
                                        total_ms: None,
                                        ttft_ms: None,
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
                        total_ms: None,
                        ttft_ms: None,
                    })
                    .await;
            }

            let final_usage = if input_tokens > 0 || output_tokens > 0 {
                Some(Usage {
                    prompt_tokens: input_tokens,
                    completion_tokens: output_tokens,
                    total_tokens: input_tokens + output_tokens,
                })
            } else {
                None
            };

            let _ = tx
                .send(ChatChunk {
                    delta: String::new(),
                    tool_calls: Vec::new(),
                    done: true,
                    usage: final_usage,
                    thinking_delta: None,
                    total_ms: Some(call_start.elapsed().as_millis() as i64),
                    ttft_ms,
                })
                .await;
        });

        Ok(rx)
    }
}

/// Append `partial` JSON string to the tool at position `index` in `pending_tools`.
/// Uses the Anthropic content block index rather than always targeting the last entry,
/// ensuring interleaved tool calls each accumulate their own JSON arguments correctly.
fn append_tool_partial(pending_tools: &mut [ToolCall], index: usize, partial: &str) {
    if let Some(tool) = pending_tools.get_mut(index) {
        if let Some(s) = tool.arguments.as_str() {
            tool.arguments = serde_json::json!(format!("{s}{partial}"));
        } else {
            tool.arguments = serde_json::json!(partial);
        }
    }
}

const CLAUDE_CODE_IDENTITY: &str =
    "You are Claude Code, Anthropic's official CLI for Claude.";

/// Strip unpaired Unicode surrogates that would cause Anthropic API errors.
fn sanitize_surrogates(s: &str) -> String {
    s.chars()
        .filter(|c| {
            let code = *c as u32;
            // Filter out surrogate range (shouldn't appear in valid UTF-8 Rust strings,
            // but guard against edge cases from external data).
            !(0xD800..=0xDFFF).contains(&code)
        })
        .collect()
}

fn to_anthropic_body(request: ChatRequest, model: String, stream: bool, is_oauth: bool) -> Value {
    let user_system = request
        .messages
        .iter()
        .filter(|m| matches!(m.role, rushdino_common::models::Role::System))
        .map(|m| m.content.clone())
        .collect::<Vec<_>>()
        .join("\n\n");

    // Build the system prompt as an array of content blocks (required by claude-code beta).
    // OAuth tokens require the Claude Code identity as the first block.
    let system_blocks: Vec<Value> = if is_oauth {
        let mut blocks = vec![json!({"type": "text", "text": CLAUDE_CODE_IDENTITY})];
        if !user_system.is_empty() {
            blocks.push(json!({"type": "text", "text": sanitize_surrogates(&user_system)}));
        }
        blocks
    } else if !user_system.is_empty() {
        vec![json!({"type": "text", "text": sanitize_surrogates(&user_system)})]
    } else {
        vec![]
    };

    // Anthropic requires strictly alternating user/assistant turns.
    // Merge consecutive same-role messages into a single message.
    let messages = {
        let mut merged: Vec<Value> = Vec::new();
        for m in request.messages.into_iter().filter(|m| !matches!(m.role, rushdino_common::models::Role::System)) {
            let role = if matches!(m.role, rushdino_common::models::Role::Assistant) {
                "assistant"
            } else {
                "user"
            };
            if let Some(last) = merged.last_mut() {
                if last.get("role").and_then(Value::as_str) == Some(role) {
                    // Merge into previous message with the same role.
                    let prev = last["content"].as_str().unwrap_or_default().to_owned();
                    last["content"] = json!(format!("{prev}\n\n{}", m.content));
                    continue;
                }
            }
            merged.push(json!({ "role": role, "content": m.content }));
        }
        merged
    };

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

    // Opus 4.6 and Sonnet 4.6 use adaptive thinking (model decides when/how much).
    // Older models use budget-based thinking with an explicit token budget.
    let is_adaptive_model =
        model.contains("opus-4-6") || model.contains("sonnet-4-6");

    let thinking_level = request.thinking_level.as_ref();
    let thinking_budget = thinking_level.and_then(|l| l.anthropic_budget_tokens());
    let thinking_effort = thinking_level.and_then(|l| l.anthropic_effort());

    // When budget-based thinking is enabled, max_tokens must exceed budget_tokens.
    let max_tokens = if !is_adaptive_model {
        match (request.max_tokens, thinking_budget) {
            (Some(mt), Some(budget)) => mt.max(budget + 1024),
            (None, Some(budget)) => budget + 1024,
            (Some(mt), None) => mt,
            (None, None) => 1024,
        }
    } else {
        request.max_tokens.unwrap_or(16384)
    };

    let mut body = json!({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "stream": stream,
    });

    if !system_blocks.is_empty() {
        body["system"] = json!(system_blocks);
    }

    if let Some(tools_vec) = tools {
        if !tools_vec.is_empty() {
            body["tools"] = json!(tools_vec);
        }
    }

    let thinking_enabled = thinking_level.is_some_and(|l| *l != ThinkingLevel::Off);

    if thinking_enabled {
        if is_adaptive_model {
            // Adaptive thinking: model decides when and how much to think.
            body["thinking"] = json!({ "type": "adaptive" });
            if let Some(effort) = thinking_effort {
                body["output_config"] = json!({ "effort": effort });
            }
        } else if let Some(budget) = thinking_budget {
            // Budget-based thinking for older models.
            body["thinking"] = json!({ "type": "enabled", "budget_tokens": budget });
            body["temperature"] = json!(1);
        }
    } else if let Some(temperature) = request.temperature {
        body["temperature"] = json!(temperature);
    }

    body
}

/// Extract usage from an Anthropic non-streaming response payload.
/// The response contains `usage.input_tokens` and `usage.output_tokens`.
fn parse_anthropic_usage(payload: &Value) -> Option<Usage> {
    let u = payload.get("usage")?;
    let input = u.get("input_tokens").and_then(Value::as_u64).unwrap_or(0) as u32;
    let output = u.get("output_tokens").and_then(Value::as_u64).unwrap_or(0) as u32;
    if input == 0 && output == 0 {
        return None;
    }
    Some(Usage {
        prompt_tokens: input,
        completion_tokens: output,
        total_tokens: input + output,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rushdino_common::models::ToolCall;
    use serde_json::json;

    #[test]
    fn append_tool_partial_routes_by_index() {
        // Two pending tool calls
        let mut tools: Vec<ToolCall> = vec![
            ToolCall { id: "t1".into(), name: "tool_a".into(), arguments: json!("") },
            ToolCall { id: "t2".into(), name: "tool_b".into(), arguments: json!("") },
        ];

        // index=0 → tool_a gets partial `{"k`
        append_tool_partial(&mut tools, 0, r#"{"k"#);
        // index=1 → tool_b gets partial `{"x`
        append_tool_partial(&mut tools, 1, r#"{"x"#);
        // index=0 → tool_a gets closing `":1}`
        append_tool_partial(&mut tools, 0, r#"":1}"#);
        // index=1 → tool_b gets closing `":2}`
        append_tool_partial(&mut tools, 1, r#"":2}"#);

        assert_eq!(tools[0].arguments.as_str().unwrap(), r#"{"k":1}"#);
        assert_eq!(tools[1].arguments.as_str().unwrap(), r#"{"x":2}"#);
    }
}
