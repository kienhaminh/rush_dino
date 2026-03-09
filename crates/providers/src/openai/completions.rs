//! OpenAI Chat Completions streaming provider.
//!
//! Translated from `openai_completions.ts`.  Implements the `/chat/completions`
//! endpoint with streaming support, compat detection (Mistral, Grok, Groq, Z.ai,
//! OpenRouter, etc.) and reasoning/thinking block handling.

use std::collections::HashMap;

use futures::StreamExt;
use reqwest::Client;
use serde_json::{json, Value};
use tokio::sync::mpsc;

use rushdino_common::{models::ToolCall, Result};

use crate::types::{ChatChunk, ChatRequest, ChatResponse, ToolDefinition, Usage};

// ---------------------------------------------------------------------------
// Compat settings
// ---------------------------------------------------------------------------

/// Which field to use for the maximum number of output tokens.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MaxTokensField {
    MaxTokens,
    MaxCompletionTokens,
}

/// Thinking/reasoning format used by an endpoint.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThinkingFormat {
    OpenAI,
    Zai,
    Qwen,
}

/// Resolved compatibility options for a specific provider / base-URL combination.
/// Mirrors `Required<OpenAICompletionsCompat>` from the TypeScript source.
#[derive(Debug, Clone)]
pub struct OpenAICompletionsCompat {
    pub supports_store: bool,
    pub supports_developer_role: bool,
    pub supports_reasoning_effort: bool,
    /// Maps our effort levels ("minimal"…"xhigh") to provider-specific strings.
    pub reasoning_effort_map: HashMap<String, String>,
    pub supports_usage_in_streaming: bool,
    pub max_tokens_field: MaxTokensField,
    pub requires_tool_result_name: bool,
    pub requires_assistant_after_tool_result: bool,
    pub requires_thinking_as_text: bool,
    pub requires_mistral_tool_ids: bool,
    pub thinking_format: ThinkingFormat,
    pub supports_strict_mode: bool,
}

// ---------------------------------------------------------------------------
// Provider struct
// ---------------------------------------------------------------------------

/// Options for a completions streaming call.
#[derive(Debug, Clone, Default)]
pub struct CompletionsStreamOptions {
    pub api_key: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f64>,
    pub reasoning_effort: Option<String>, // "minimal"|"low"|"medium"|"high"|"xhigh"
    pub tool_choice: Option<Value>,
    pub extra_headers: HashMap<String, String>,
    pub session_id: Option<String>,
}

/// Streaming provider for the OpenAI `/chat/completions` endpoint.
///
/// Works with any OpenAI-compatible backend (Mistral, Grok, Groq, OpenRouter,
/// Vercel AI Gateway, Z.ai, etc.) by auto-detecting compat settings from the
/// configured `base_url` / `provider` hint.
#[derive(Clone)]
pub struct CompletionsProvider {
    client: Client,
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
    /// Optional provider hint for compat detection (e.g. "mistral", "xai", "groq").
    pub provider_hint: Option<String>,
}

impl CompletionsProvider {
    pub fn new(
        base_url: String,
        model: String,
        api_key: Option<String>,
        provider_hint: Option<String>,
    ) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.trim().to_owned(),
            model: model.trim().to_owned(),
            api_key: api_key.map(|k| k.trim().to_owned()),
            provider_hint,
        }
    }

    // -----------------------------------------------------------------------
    // Compat detection
    // -----------------------------------------------------------------------

    /// Auto-detect compat settings from `provider_hint` and `base_url`.
    /// Mirrors `detectCompat` in the TypeScript source.
    fn detect_compat(&self) -> OpenAICompletionsCompat {
        let provider = self.provider_hint.as_deref().unwrap_or("");
        let base_url = &self.base_url;

        let is_zai = provider == "zai" || base_url.contains("api.z.ai");
        let is_xai = provider == "xai" || base_url.contains("api.x.ai");
        let is_mistral = provider == "mistral" || base_url.contains("mistral.ai");
        let is_groq = provider == "groq" || base_url.contains("groq.com");
        let is_cerebras = provider == "cerebras" || base_url.contains("cerebras.ai");
        let is_opencode = provider == "opencode" || base_url.contains("opencode.ai");
        let is_chutes = base_url.contains("chutes.ai");
        let is_deepseek = base_url.contains("deepseek.com");

        let is_non_standard = is_cerebras
            || is_xai
            || is_mistral
            || is_chutes
            || is_deepseek
            || is_zai
            || is_opencode;

        let use_max_tokens = is_mistral || is_chutes;

        // Groq + qwen3-32b maps all effort levels to "default"
        let reasoning_effort_map: HashMap<String, String> =
            if is_groq && self.model == "qwen/qwen3-32b" {
                ["minimal", "low", "medium", "high", "xhigh"]
                    .iter()
                    .map(|&k| (k.to_owned(), "default".to_owned()))
                    .collect()
            } else {
                HashMap::new()
            };

        OpenAICompletionsCompat {
            supports_store: !is_non_standard,
            supports_developer_role: !is_non_standard,
            supports_reasoning_effort: !is_xai && !is_zai,
            reasoning_effort_map,
            supports_usage_in_streaming: true,
            max_tokens_field: if use_max_tokens {
                MaxTokensField::MaxTokens
            } else {
                MaxTokensField::MaxCompletionTokens
            },
            requires_tool_result_name: is_mistral,
            requires_assistant_after_tool_result: false,
            requires_thinking_as_text: is_mistral,
            requires_mistral_tool_ids: is_mistral,
            thinking_format: if is_zai || is_mistral {
                // Zai and Qwen-style
                if is_zai {
                    ThinkingFormat::Zai
                } else {
                    ThinkingFormat::OpenAI
                }
            } else {
                ThinkingFormat::OpenAI
            },
            supports_strict_mode: true,
        }
    }

    // -----------------------------------------------------------------------
    // Mistral tool-call ID normalisation
    // -----------------------------------------------------------------------

    /// Mistral requires tool call IDs to be exactly 9 alphanumeric characters.
    fn normalize_mistral_tool_id(id: &str) -> String {
        let mut normalized: String = id.chars().filter(|c| c.is_alphanumeric()).collect();
        if normalized.len() < 9 {
            let padding = "ABCDEFGHI";
            let needed = 9 - normalized.len();
            normalized.push_str(&padding[..needed]);
        } else if normalized.len() > 9 {
            normalized.truncate(9);
        }
        normalized
    }

    /// Normalize a tool call ID depending on compat requirements.
    fn normalize_tool_call_id(
        id: &str,
        compat: &OpenAICompletionsCompat,
        provider: &str,
    ) -> String {
        if compat.requires_mistral_tool_ids {
            return Self::normalize_mistral_tool_id(id);
        }

        // Handle pipe-separated IDs from OpenAI Responses API: {call_id}|{id}
        if id.contains('|') {
            let call_id = id.split('|').next().unwrap_or(id);
            let sanitized: String = call_id
                .chars()
                .map(|c| {
                    if c.is_alphanumeric() || c == '_' || c == '-' {
                        c
                    } else {
                        '_'
                    }
                })
                .collect();
            return sanitized[..sanitized.len().min(40)].to_owned();
        }

        if provider == "openai" && id.len() > 40 {
            return id[..40].to_owned();
        }

        id.to_owned()
    }

    // -----------------------------------------------------------------------
    // Message conversion
    // -----------------------------------------------------------------------

    /// Convert our internal `Message` list to OpenAI chat completion params.
    /// Mirrors `convertMessages` in the TypeScript source.
    fn convert_messages(
        messages: &[rushdino_common::models::Message],
        compat: &OpenAICompletionsCompat,
        provider: &str,
        system_prompt: Option<&str>,
    ) -> Vec<Value> {
        use rushdino_common::models::Role;

        let mut params: Vec<Value> = Vec::new();

        // System / developer prompt
        if let Some(sys) = system_prompt {
            let role = if compat.supports_developer_role {
                "developer"
            } else {
                "system"
            };
            params.push(json!({ "role": role, "content": sys }));
        }

        let mut last_role: Option<String> = None;
        let mut i = 0;

        while i < messages.len() {
            let msg = &messages[i];

            // Some providers require a synthetic assistant message between tool results and user
            if compat.requires_assistant_after_tool_result
                && last_role.as_deref() == Some("tool")
                && msg.role == Role::User
            {
                params.push(json!({
                    "role": "assistant",
                    "content": "I have processed the tool results."
                }));
            }

            match msg.role {
                Role::System => {
                    // Already handled above via system_prompt; skip inline system messages
                    last_role = Some("system".to_owned());
                }

                Role::User => {
                    params.push(json!({ "role": "user", "content": &msg.content }));
                    last_role = Some("user".to_owned());
                }

                Role::Assistant => {
                    let text_content: Value = if msg.content.trim().is_empty() {
                        if compat.requires_assistant_after_tool_result {
                            Value::String(String::new())
                        } else {
                            Value::Null
                        }
                    } else if provider == "github-copilot" {
                        Value::String(msg.content.clone())
                    } else {
                        json!([{ "type": "text", "text": &msg.content }])
                    };

                    let mut assistant_msg = json!({
                        "role": "assistant",
                        "content": text_content,
                    });

                    // Tool calls
                    if let Some(calls) = &msg.tool_calls {
                        if !calls.is_empty() {
                            let tool_calls_json: Vec<Value> = calls
                                .iter()
                                .map(|tc| {
                                    let id = Self::normalize_tool_call_id(&tc.id, compat, provider);
                                    json!({
                                        "id": id,
                                        "type": "function",
                                        "function": {
                                            "name": tc.name,
                                            "arguments": tc.arguments.to_string()
                                        }
                                    })
                                })
                                .collect();
                            assistant_msg["tool_calls"] = json!(tool_calls_json);
                        }
                    }

                    params.push(assistant_msg);
                    last_role = Some("assistant".to_owned());
                }

                Role::Tool => {
                    // Collect consecutive tool-result messages
                    while i < messages.len() && messages[i].role == Role::Tool {
                        let tool_msg = &messages[i];
                        // id is always a String (not Optional) — use directly
                        let call_id = Self::normalize_tool_call_id(&tool_msg.id, compat, provider);
                        params.push(json!({
                            "role": "tool",
                            "content": &tool_msg.content,
                            "tool_call_id": call_id,
                        }));
                        i += 1;
                    }

                    last_role = Some("tool".to_owned());
                    continue; // i already advanced
                }
            }

            i += 1;
        }

        params
    }

    // -----------------------------------------------------------------------
    // Tool conversion
    // -----------------------------------------------------------------------

    fn convert_tools(tools: &[ToolDefinition], compat: &OpenAICompletionsCompat) -> Vec<Value> {
        tools
            .iter()
            .map(|tool| {
                let function = if compat.supports_strict_mode {
                    json!({
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters,
                        "strict": false,
                    })
                } else {
                    json!({
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters,
                    })
                };
                json!({ "type": "function", "function": function })
            })
            .collect()
    }

    // -----------------------------------------------------------------------
    // Reasoning effort mapping
    // -----------------------------------------------------------------------

    fn map_reasoning_effort(effort: &str, map: &HashMap<String, String>) -> String {
        map.get(effort)
            .cloned()
            .unwrap_or_else(|| effort.to_owned())
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    pub async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        let mut rx = self
            .stream_chat(request, CompletionsStreamOptions::default())
            .await?;
        let mut content = String::new();
        let mut tool_calls = Vec::new();
        let mut usage = None;

        while let Some(chunk) = rx.recv().await {
            content.push_str(&chunk.delta);
            tool_calls.extend(chunk.tool_calls);
            if chunk.done {
                usage = chunk.usage;
                break;
            }
        }

        Ok(ChatResponse {
            content,
            tool_calls,
            rich_content: None,
            usage,
            finish_reason: "stop".to_owned(),
        })
    }

    pub async fn stream_chat(
        &self,
        request: ChatRequest,
        stream_opts: CompletionsStreamOptions,
    ) -> Result<mpsc::Receiver<ChatChunk>> {
        let (tx, rx) = mpsc::channel(128);

        let compat = self.detect_compat();
        let provider = self.provider_hint.clone().unwrap_or_default();
        let model_id = request.model.clone().unwrap_or_else(|| self.model.clone());
        let api_key = stream_opts
            .api_key
            .clone()
            .or_else(|| self.api_key.clone())
            .unwrap_or_default();

        // Extract system prompt from messages
        let system_prompt: Option<String> = request
            .messages
            .iter()
            .find(|m| m.role == rushdino_common::models::Role::System)
            .map(|m| m.content.clone());

        // Filter system messages out — they're sent as the "system" param
        let conversation: Vec<rushdino_common::models::Message> = request
            .messages
            .into_iter()
            .filter(|m| m.role != rushdino_common::models::Role::System)
            .collect();

        let messages =
            Self::convert_messages(&conversation, &compat, &provider, system_prompt.as_deref());

        // Build request body
        let mut body = json!({
            "model": model_id,
            "messages": messages,
            "stream": true,
        });

        // Usage in streaming
        if compat.supports_usage_in_streaming {
            body["stream_options"] = json!({ "include_usage": true });
        }

        // store: false (opt-out of server-side storage)
        if compat.supports_store {
            body["store"] = json!(false);
        }

        // Max tokens
        if let Some(max_tok) = request.max_tokens.or(stream_opts.max_tokens) {
            match compat.max_tokens_field {
                MaxTokensField::MaxTokens => {
                    body["max_tokens"] = json!(max_tok);
                }
                MaxTokensField::MaxCompletionTokens => {
                    body["max_completion_tokens"] = json!(max_tok);
                }
            }
        }

        // Temperature
        if let Some(temp) = request
            .temperature
            .or(stream_opts.temperature.map(|t| t as f32))
        {
            body["temperature"] = json!(temp);
        }

        // Tools
        if let Some(tools) = &request.tools {
            body["tools"] = json!(Self::convert_tools(tools, &compat));
        }

        // Tool choice
        if let Some(tc) = &stream_opts.tool_choice {
            body["tool_choice"] = tc.clone();
        }

        // Reasoning effort
        if let Some(effort) = &stream_opts.reasoning_effort {
            let mapped = Self::map_reasoning_effort(effort, &compat.reasoning_effort_map);
            if compat.thinking_format == ThinkingFormat::Zai
                || compat.thinking_format == ThinkingFormat::Qwen
            {
                body["enable_thinking"] = json!(!effort.is_empty());
            } else if compat.supports_reasoning_effort {
                body["reasoning_effort"] = json!(mapped);
            }
        }

        let client = self.client.clone();
        let url = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));
        let mut headers = reqwest::header::HeaderMap::new();

        for (k, v) in &stream_opts.extra_headers {
            if let (Ok(name), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(k.as_bytes()),
                reqwest::header::HeaderValue::from_str(v),
            ) {
                headers.insert(name, val);
            }
        }

        tokio::spawn(async move {
            let mut req = client
                .post(&url)
                .headers(headers)
                .json(&body)
                .timeout(std::time::Duration::from_secs(300));

            if !api_key.is_empty() {
                req = req.bearer_auth(&api_key);
            }

            let response = match req.send().await {
                Ok(r) => r,
                Err(e) => {
                    let _ = tx
                        .send(ChatChunk {
                            delta: format!("Request failed: {e}"),
                            tool_calls: vec![],
                            done: true,
                            usage: None,
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
                    })
                    .await;
                return;
            }

            let mut stream = response.bytes_stream();
            let mut buffer = String::new();
            // Pending tool calls accumulate arguments across deltas: call_id -> (name, partial_args)
            let mut pending_calls: HashMap<String, (String, String)> = HashMap::new();
            // Usage captured from the usage SSE event (sent by OpenAI before [DONE] when include_usage=true)
            let mut pending_usage: Option<Usage> = None;

            while let Some(item) = stream.next().await {
                let Ok(chunk) = item else { break };
                buffer.push_str(&String::from_utf8_lossy(&chunk));

                while let Some(idx) = buffer.find('\n') {
                    let line = buffer[..idx].trim().to_owned();
                    buffer = buffer[idx + 1..].to_owned();

                    if !line.starts_with("data:") {
                        continue;
                    }
                    let data = line.trim_start_matches("data:").trim();
                    if data == "[DONE]" {
                        let _ = tx
                            .send(ChatChunk {
                                delta: String::new(),
                                tool_calls: vec![],
                                done: true,
                                usage: pending_usage,
                            })
                            .await;
                        return;
                    }

                    let Ok(value) = serde_json::from_str::<Value>(data) else {
                        continue;
                    };

                    // Usage event: OpenAI sends a chunk with empty choices[] and a usage field
                    // when stream_options.include_usage=true. Capture it before the [DONE] event.
                    if value.pointer("/choices/0").is_none() {
                        if let Some(u) = value.get("usage") {
                            let prompt = u.get("prompt_tokens").and_then(Value::as_u64).unwrap_or(0) as u32;
                            let completion = u.get("completion_tokens").and_then(Value::as_u64).unwrap_or(0) as u32;
                            let total = u.get("total_tokens").and_then(Value::as_u64).unwrap_or(0) as u32;
                            pending_usage = Some(Usage { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total });
                        }
                        continue;
                    }

                    // Text delta
                    let delta_text = value
                        .pointer("/choices/0/delta/content")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_owned();

                    // Tool call deltas
                    let mut finished_tool_calls: Vec<ToolCall> = Vec::new();

                    if let Some(Value::Array(tool_calls)) =
                        value.pointer("/choices/0/delta/tool_calls")
                    {
                        for tc in tool_calls {
                            let call_id = tc
                                .get("id")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_owned();
                            let fn_name = tc
                                .pointer("/function/name")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_owned();
                            let fn_args_delta = tc
                                .pointer("/function/arguments")
                                .and_then(Value::as_str)
                                .unwrap_or_default();

                            if !call_id.is_empty() {
                                // New tool call started
                                pending_calls
                                    .entry(call_id.clone())
                                    .or_insert_with(|| (fn_name.clone(), String::new()));
                            }

                            // Accumulate arguments by index (use call_id as key if present,
                            // otherwise use index from the list — simplify by key only)
                            let key = if call_id.is_empty() {
                                tc.get("index")
                                    .and_then(Value::as_u64)
                                    .map(|i| i.to_string())
                                    .unwrap_or_else(|| "0".to_owned())
                            } else {
                                call_id.clone()
                            };

                            if let Some(entry) = pending_calls.get_mut(&key) {
                                if !fn_name.is_empty() {
                                    entry.0 = fn_name.clone();
                                }
                                entry.1.push_str(fn_args_delta);
                            } else if !key.is_empty() {
                                pending_calls.insert(key, (fn_name, fn_args_delta.to_owned()));
                            }
                        }
                    }

                    // Check finish_reason: if tool_calls, finalise pending
                    let finish_reason = value
                        .pointer("/choices/0/finish_reason")
                        .and_then(Value::as_str)
                        .unwrap_or_default();

                    if finish_reason == "tool_calls" {
                        for (id, (name, args_str)) in pending_calls.drain() {
                            let arguments =
                                serde_json::from_str(&args_str).unwrap_or_else(|_| json!({}));
                            finished_tool_calls.push(ToolCall {
                                id,
                                name,
                                arguments,
                            });
                        }
                    }

                    if !delta_text.is_empty() || !finished_tool_calls.is_empty() {
                        let _ = tx
                            .send(ChatChunk {
                                delta: delta_text,
                                tool_calls: finished_tool_calls,
                                done: false,
                                usage: None,
                            })
                            .await;
                    }

                    // Don't return early on finish_reason=="stop": OpenAI sends a usage event
                    // AFTER this chunk but BEFORE [DONE] when include_usage=true. Let [DONE]
                    // be the terminator so we always capture usage.
                }
            }

            // Stream ended without [DONE]
            let _ = tx
                .send(ChatChunk {
                    delta: String::new(),
                    tool_calls: vec![],
                    done: true,
                    usage: pending_usage,
                })
                .await;
        });

        Ok(rx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use rushdino_common::models::{Message, Role};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    /// Spawn a minimal HTTP/SSE mock server on a random port.
    /// Returns the base URL (e.g. "http://127.0.0.1:PORT").
    async fn spawn_sse_server(sse_body: String) -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 8192];
            let _ = stream.read(&mut buf).await;
            let content_length = sse_body.len();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {content_length}\r\nConnection: close\r\n\r\n{sse_body}"
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        format!("http://127.0.0.1:{port}")
    }

    fn user_message(content: &str) -> Message {
        Message {
            id: String::new(),
            role: Role::User,
            content: content.to_owned(),
            tool_calls: None,
            rich_content: None,
            created_at: Utc::now(),
        }
    }

    fn simple_request(content: &str) -> ChatRequest {
        ChatRequest {
            messages: vec![user_message(content)],
            tools: None,
            temperature: None,
            max_tokens: None,
            model: None,
        }
    }

    #[tokio::test]
    async fn stream_chat_captures_usage_from_sse_usage_event() {
        let sse_body = concat!(
            "data: {\"id\":\"x\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hi\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"x\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
            "data: {\"id\":\"x\",\"object\":\"chat.completion.chunk\",\"choices\":[],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5,\"total_tokens\":15}}\n\n",
            "data: [DONE]\n\n",
        ).to_owned();

        let base_url = spawn_sse_server(sse_body).await;
        let provider = CompletionsProvider::new(base_url, "gpt-4o".to_owned(), None, None);

        let response = provider.chat(simple_request("Hello")).await.unwrap();

        assert_eq!(response.content, "Hi");
        let usage = response.usage.expect("usage must be populated when provided in SSE stream");
        assert_eq!(usage.prompt_tokens, 10);
        assert_eq!(usage.completion_tokens, 5);
        assert_eq!(usage.total_tokens, 15);
    }

    #[tokio::test]
    async fn stream_chat_returns_none_usage_when_provider_omits_it() {
        let sse_body = concat!(
            "data: {\"id\":\"x\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"x\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
            "data: [DONE]\n\n",
        ).to_owned();

        let base_url = spawn_sse_server(sse_body).await;
        let provider = CompletionsProvider::new(base_url, "gpt-4o".to_owned(), None, None);

        let response = provider.chat(simple_request("Hello")).await.unwrap();

        assert_eq!(response.content, "Hello");
        assert!(response.usage.is_none(), "usage should be None when provider omits the usage chunk");
    }

    #[tokio::test]
    async fn stream_chat_text_content_is_concatenated_across_deltas() {
        let sse_body = concat!(
            "data: {\"id\":\"x\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hel\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"x\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"lo\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"x\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
            "data: [DONE]\n\n",
        ).to_owned();

        let base_url = spawn_sse_server(sse_body).await;
        let provider = CompletionsProvider::new(base_url, "gpt-4o".to_owned(), None, None);

        let response = provider.chat(simple_request("Hi")).await.unwrap();

        assert_eq!(response.content, "Hello");
    }
}
