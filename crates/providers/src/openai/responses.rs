use std::collections::HashSet;
use std::time::Duration;

use reqwest::Client;
use serde_json::json;
use tokio::sync::mpsc;

use rushdino_common::Result;

use crate::types::{ChatChunk, ChatRequest, ChatResponse};

use super::responses_shared::{
    convert_responses_messages, convert_responses_tools, process_responses_stream,
    ConvertResponsesMessagesOptions,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Providers that use the pipe-separated `{call_id}|{item_id}` format for
/// tool call IDs in the Responses API.
fn openai_tool_call_providers() -> HashSet<String> {
    ["openai", "openai-codex", "opencode"]
        .iter()
        .map(|s| s.to_string())
        .collect()
}

// ---------------------------------------------------------------------------
// Cache retention helpers
// ---------------------------------------------------------------------------

/// Cache retention preference.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum CacheRetention {
    None,
    #[default]
    Short,
    Long,
}

/// Resolve prompt_cache_retention for the Responses API.
/// Only applies when `cacheRetention == Long` **and** the endpoint is api.openai.com.
fn get_prompt_cache_retention(
    base_url: &str,
    cache_retention: CacheRetention,
) -> Option<&'static str> {
    if cache_retention != CacheRetention::Long {
        return None;
    }
    if base_url.contains("api.openai.com") {
        return Some("24h");
    }
    None
}

// ---------------------------------------------------------------------------
// Stream options
// ---------------------------------------------------------------------------

/// Options for OpenAI Responses-API streaming calls.
#[derive(Debug, Clone, Default)]
pub struct ResponsesStreamOptions {
    pub api_key: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f64>,
    pub reasoning_effort: Option<String>, // "minimal"|"low"|"medium"|"high"|"xhigh"
    pub reasoning_summary: Option<String>, // "auto"|"detailed"|"concise"
    pub service_tier: Option<String>,     // "default"|"flex"|"priority"
    pub cache_retention: Option<CacheRetention>,
    pub session_id: Option<String>,
    pub extra_headers: std::collections::HashMap<String, String>,
}

// ---------------------------------------------------------------------------
// Provider struct
// ---------------------------------------------------------------------------

/// Streaming provider for the OpenAI Responses API (`/responses`).
///
/// Mirrors `streamOpenAIResponses` / `createClient` / `buildParams` from
/// `openai_ressponse.ts`.
#[derive(Clone)]
pub struct ResponsesProvider {
    client: Client,
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
    /// Optional provider hint for compat detection (e.g. "openai", "github-copilot").
    pub provider_hint: Option<String>,
    /// Whether the model is a reasoning model (influences system/developer role selection).
    pub is_reasoning_model: bool,
    /// Whether the model accepts image input.
    pub supports_images: bool,
}

impl ResponsesProvider {
    pub fn new(
        base_url: String,
        model: String,
        api_key: Option<String>,
        provider_hint: Option<String>,
        is_reasoning_model: bool,
    ) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.trim().to_owned(),
            model: model.trim().to_owned(),
            api_key: api_key.map(|k| k.trim().to_owned()),
            provider_hint,
            is_reasoning_model,
            supports_images: false,
        }
    }

    // -----------------------------------------------------------------------
    // URL helpers
    // -----------------------------------------------------------------------

    fn responses_url(&self) -> String {
        let base = self.base_url.trim_end_matches('/');
        if base.ends_with("/responses") {
            base.to_owned()
        } else {
            format!("{}/responses", base)
        }
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    pub async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        let reasoning_effort = request
            .thinking_level
            .as_ref()
            .and_then(|l| l.openai_reasoning_effort())
            .map(str::to_owned);
        let stream_opts = ResponsesStreamOptions {
            reasoning_effort,
            ..Default::default()
        };
        let mut rx = self.stream_chat(request, stream_opts).await?;
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

    pub async fn stream_chat(
        &self,
        request: ChatRequest,
        stream_opts: ResponsesStreamOptions,
    ) -> Result<mpsc::Receiver<ChatChunk>> {
        let (tx, rx) = mpsc::channel(128);

        let provider = self.provider_hint.clone().unwrap_or_default();
        let allowed_providers = openai_tool_call_providers();
        let model_id = request.model.clone().unwrap_or_else(|| self.model.clone());
        let api_key = stream_opts
            .api_key
            .clone()
            .or_else(|| self.api_key.clone())
            .unwrap_or_default();

        // Extract system prompt
        let system_prompt: Option<String> = request
            .messages
            .iter()
            .find(|m| m.role == rushdino_common::models::Role::System)
            .map(|m| m.content.clone());

        // Filter out system messages — they're handled via the prompt header
        let conversation: Vec<rushdino_common::models::Message> = request
            .messages
            .into_iter()
            .filter(|m| m.role != rushdino_common::models::Role::System)
            .collect();

        // Convert messages
        let opts = ConvertResponsesMessagesOptions {
            include_system_prompt: true,
        };
        let messages = convert_responses_messages(
            &conversation,
            system_prompt.as_deref(),
            self.is_reasoning_model,
            self.supports_images,
            &allowed_providers,
            &provider,
            &opts,
        );

        // Resolve cache retention
        let cache_retention = stream_opts.cache_retention.unwrap_or_default();

        // Guard: OpenAI Responses API rejects empty `input` arrays with
        // "missing_required_parameter". Ensure at least one user input exists.
        let messages = if messages.is_empty() {
            vec![json!({
                "role": "user",
                "content": [{ "type": "input_text", "text": "Continue." }]
            })]
        } else {
            messages
        };

        // Build request body
        let mut body = json!({
            "model": model_id,
            "input": messages,
            "stream": true,
            "store": false,
        });

        // Prompt cache key (session affinity)
        if cache_retention != CacheRetention::None {
            if let Some(sid) = &stream_opts.session_id {
                body["prompt_cache_key"] = json!(sid);
            }
        }

        // Prompt cache retention
        if let Some(retention) = get_prompt_cache_retention(&self.base_url, cache_retention) {
            body["prompt_cache_retention"] = json!(retention);
        }

        // Max output tokens
        if let Some(max_tok) = request.max_tokens.or(stream_opts.max_tokens) {
            body["max_output_tokens"] = json!(max_tok);
        }

        // Temperature
        if let Some(temp) = request
            .temperature
            .or(stream_opts.temperature.map(|t| t as f32))
        {
            body["temperature"] = json!(temp);
        }

        // Service tier
        if let Some(tier) = &stream_opts.service_tier {
            body["service_tier"] = json!(tier);
        }

        // Tools
        if let Some(tools) = &request.tools {
            body["tools"] = json!(convert_responses_tools(tools, None));
        }

        // Reasoning
        if self.is_reasoning_model {
            let has_effort = stream_opts.reasoning_effort.is_some();
            let has_summary = stream_opts.reasoning_summary.is_some();

            if has_effort || has_summary {
                let effort = stream_opts.reasoning_effort.as_deref().unwrap_or("medium");
                let summary = stream_opts.reasoning_summary.as_deref().unwrap_or("auto");
                body["reasoning"] = json!({
                    "effort": effort,
                    "summary": summary
                });
                body["include"] = json!(["reasoning.encrypted_content"]);
            } else if model_id.starts_with("gpt-5") {
                // Workaround for gpt-5 models that always reason:
                // inject a developer message to minimise reasoning usage
                // (see: https://community.openai.com/t/need-reasoning-false-option-for-gpt-5/1351588/7)
                if let Some(arr) = body["input"].as_array_mut() {
                    arr.push(json!({
                        "role": "developer",
                        "content": [{
                            "type": "input_text",
                            "text": "# Juice: 0 !important"
                        }]
                    }));
                }
            }
        }

        let client = self.client.clone();
        let url = self.responses_url();
        let mut headers = reqwest::header::HeaderMap::new();

        for (k, v) in &stream_opts.extra_headers {
            if let (Ok(name), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(k.as_bytes()),
                reqwest::header::HeaderValue::from_str(v),
            ) {
                headers.insert(name, val);
            }
        }

        headers.insert("accept", "text/event-stream".parse().unwrap());

        tokio::spawn(async move {
            let mut req = client
                .post(&url)
                .headers(headers)
                .json(&body)
                .timeout(Duration::from_secs(300));

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

            // Delegate to shared stream processor
            process_responses_stream(response, tx).await;
        });

        Ok(rx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ChatRequest;
    use rushdino_common::models::{Message, Role};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn user_message(text: &str) -> Message {
        Message::new("user-1", Role::User, text)
    }

    fn system_message(text: &str) -> Message {
        Message::new("system-1", Role::System, text)
    }

    // -----------------------------------------------------------------------
    // Empty-input guard
    // -----------------------------------------------------------------------

    /// When only a system message is present the conversation list is filtered
    /// to nothing. The guard must inject a "Continue." user turn so the
    /// Responses API does not reject the request with "missing_required_parameter".
    #[tokio::test]
    async fn empty_input_guard_injects_continue_message_for_system_only_conversation() {
        // Capture the raw request body to verify `input` is non-empty.
        // We do this by intercepting via the mock server's read buffer.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let (body_tx, mut body_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(1);
        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 16384];
            let n = stream.read(&mut buf).await.unwrap_or(0);
            let _ = body_tx.send(buf[..n].to_vec()).await;
            let response_body = concat!(
                "data: {\"type\":\"response.output_text.delta\",\"delta\":\"ok\"}\n\n",
                "data: {\"type\":\"response.completed\"}\n\n",
            );
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });

        let provider = ResponsesProvider::new(
            format!("http://127.0.0.1:{port}"),
            "gpt-4o".to_owned(),
            None,
            None,
            false,
        );

        // No messages at all — system_prompt is None and conversation is empty,
        // so convert_responses_messages returns [] and the guard must fire.
        let request = ChatRequest {
            messages: vec![],
            tools: None,
            temperature: None,
            max_tokens: None,
            model: None,
            thinking_level: None,
        };

        let _ = provider.chat(request).await;

        // Read the raw HTTP request and verify `"input"` is non-empty.
        let raw = body_rx.recv().await.expect("should receive request body");
        let raw_str = String::from_utf8_lossy(&raw);
        // Extract the JSON body (after headers).
        if let Some(json_start) = raw_str.find('{') {
            let json_str = &raw_str[json_start..];
            let body: serde_json::Value =
                serde_json::from_str(json_str).expect("request body must be valid JSON");
            let input = body["input"].as_array().expect("input must be an array");
            assert!(!input.is_empty(), "input must not be empty — guard should inject a user turn");
            // The injected turn must be a user role with "Continue." text.
            let injected = &input[0];
            assert_eq!(injected["role"], "user");
            assert_eq!(injected["content"][0]["text"], "Continue.");
        }
    }

    /// Normal conversation (user message present) must NOT inject the fallback.
    #[tokio::test]
    async fn normal_conversation_does_not_inject_continue_message() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let (body_tx, mut body_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(1);
        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 16384];
            let n = stream.read(&mut buf).await.unwrap_or(0);
            let _ = body_tx.send(buf[..n].to_vec()).await;
            let response_body = "data: {\"type\":\"response.completed\"}\n\n";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });

        let provider = ResponsesProvider::new(
            format!("http://127.0.0.1:{port}"),
            "gpt-4o".to_owned(),
            None,
            None,
            false,
        );

        let request = ChatRequest {
            messages: vec![
                system_message("You are helpful."),
                user_message("What is 2+2?"),
            ],
            tools: None,
            temperature: None,
            max_tokens: None,
            model: None,
            thinking_level: None,
        };

        let _ = provider.chat(request).await;

        let raw = body_rx.recv().await.expect("should receive request body");
        let raw_str = String::from_utf8_lossy(&raw);
        if let Some(json_start) = raw_str.find('{') {
            let json_str = &raw_str[json_start..];
            let body: serde_json::Value =
                serde_json::from_str(json_str).expect("request body must be valid JSON");
            let input = body["input"].as_array().expect("input must be an array");
            // Must not contain the synthetic "Continue." turn.
            let has_continue = input.iter().any(|entry| {
                entry["content"]
                    .as_array()
                    .and_then(|c| c.first())
                    .and_then(|b| b["text"].as_str())
                    == Some("Continue.")
            });
            assert!(!has_continue, "real conversation must not contain synthetic Continue. turn");
        }
    }
}
