use std::collections::HashMap;
use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use futures::StreamExt;
use reqwest::{header::HeaderMap, Client};
use serde_json::{json, Value};
use tokio::sync::mpsc;

use rushdino_common::{
    models::{Role, ToolCall},
    AppError, Result,
};

use crate::types::{ChatChunk, ChatRequest, ChatResponse, ModelInfo, ToolDefinition};

/// Default OpenAI Codex Responses API endpoint.
const DEFAULT_CODEX_BASE_URL: &str = "https://chatgpt.com/backend-api";
const JWT_CLAIM_PATH: &str = "https://api.openai.com/auth";
const MAX_RETRIES: u32 = 3;
const BASE_DELAY_MS: u64 = 1000;

fn split_tool_call_id(id: &str) -> (&str, Option<&str>) {
    let mut parts = id.splitn(2, '|');
    let call_id = parts.next().unwrap_or("");
    let item_id = parts.next().filter(|value| !value.is_empty());
    (call_id, item_id)
}

fn compose_tool_call_id(call_id: &str, item_id: Option<&str>) -> String {
    match item_id.filter(|value| !value.is_empty()) {
        Some(item_id) => format!("{call_id}|{item_id}"),
        None => call_id.to_owned(),
    }
}

#[derive(Clone)]
pub struct CodexResponsesProvider {
    client: Client,
    pub model: String,
    pub access_token: String,
    pub base_url: Option<String>,
}

impl CodexResponsesProvider {
    pub fn new(model: String, access_token: String, base_url: Option<String>) -> Self {
        Self {
            client: Client::new(),
            model: model.trim().to_owned(),
            access_token: access_token.trim().to_owned(),
            base_url,
        }
    }

    /// Resolve the Codex Responses API URL.
    fn resolve_url(&self) -> String {
        let raw = self
            .base_url
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or(DEFAULT_CODEX_BASE_URL)
            .trim_end_matches('/');
        if raw.ends_with("/codex/responses") {
            raw.to_owned()
        } else if raw.ends_with("/codex") {
            format!("{}/responses", raw)
        } else {
            format!("{}/codex/responses", raw)
        }
    }

    /// Extract the chatgpt-account-id from the JWT token.
    fn extract_account_id(token: &str) -> Result<String> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return Err(AppError::Provider("Invalid JWT token format".into()));
        }

        let payload_b64 = parts[1];
        let payload_bytes = URL_SAFE_NO_PAD
            .decode(payload_b64)
            .map_err(|e| AppError::Provider(format!("Failed to decode JWT payload: {e}")))?;

        let payload: Value = serde_json::from_slice(&payload_bytes)
            .map_err(|e| AppError::Provider(format!("Failed to parse JWT payload JSON: {e}")))?;

        let account_id = payload
            .get(JWT_CLAIM_PATH)
            .and_then(|v| v.get("chatgpt_account_id"))
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Provider("No chatgpt_account_id found in token".into()))?;

        Ok(account_id.to_owned())
    }

    /// Clamp reasoning effort based on model constraints (from TS logic).
    #[allow(dead_code)]
    fn clamp_reasoning_effort(model_id: &str, effort: &str) -> String {
        let id = model_id.split('/').last().unwrap_or(model_id);
        match (id, effort) {
            (id, "minimal") if id.starts_with("gpt-5.2") || id.starts_with("gpt-5.3") => {
                "low".to_owned()
            }
            ("gpt-5.1", "xhigh") => "high".to_owned(),
            ("gpt-5.1-codex-mini", "high") | ("gpt-5.1-codex-mini", "xhigh") => "high".to_owned(),
            ("gpt-5.1-codex-mini", _) => "medium".to_owned(),
            (_, e) => e.to_owned(),
        }
    }

    /// Build the standard Codex Headers.
    fn build_headers(&self) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        let account_id = Self::extract_account_id(&self.access_token)?;

        headers.insert(
            "Authorization",
            format!("Bearer {}", self.access_token)
                .parse()
                .map_err(|e| AppError::Provider(format!("Invalid auth header: {e}")))?,
        );
        headers.insert(
            "chatgpt-account-id",
            account_id
                .parse()
                .map_err(|e| AppError::Provider(format!("Invalid account-id header: {e}")))?,
        );
        headers.insert("OpenAI-Beta", "responses=experimental".parse().unwrap());
        headers.insert("originator", "pi".parse().unwrap());

        let user_agent = format!("pi (rust; {})", std::env::consts::OS);
        headers.insert(
            "User-Agent",
            user_agent
                .parse()
                .map_err(|e| AppError::Provider(format!("Invalid user-agent: {e}")))?,
        );
        headers.insert("accept", "text/event-stream".parse().unwrap());
        headers.insert("content-type", "application/json".parse().unwrap());

        Ok(headers)
    }

    /// Parse a Codex error into a friendly message if possible (inspired by parseErrorResponse in TS).
    async fn parse_codex_error(res: reqwest::Response) -> String {
        let status = res.status();
        let body_text = res.text().await.unwrap_or_default();

        if let Ok(json) = serde_json::from_str::<Value>(&body_text) {
            if let Some(err) = json.get("error") {
                let code = err
                    .get("code")
                    .or(err.get("type"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let message = err
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned();

                // Friendly message for usage limits
                let code_lower = code.to_lowercase();
                if status.as_u16() == 429
                    || code_lower.contains("usage_limit_reached")
                    || code_lower.contains("usage_not_included")
                    || code_lower.contains("rate_limit_exceeded")
                {
                    let plan = err
                        .get("plan_type")
                        .and_then(Value::as_str)
                        .map(|p| format!(" ({} plan)", p.to_lowercase()))
                        .unwrap_or_default();
                    let resets_at = err.get("resets_at").and_then(Value::as_u64);
                    let when = if let Some(r) = resets_at {
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_secs();
                        let mins = if r > now { (r - now) / 60 } else { 0 };
                        format!(" Try again in ~{mins} min.")
                    } else {
                        String::new()
                    };
                    return format!("You have hit your ChatGPT usage limit{plan}.{when}");
                }

                if !message.is_empty() {
                    return message;
                }
            }
        }

        format!("Codex error: {} — {}", status, body_text)
    }

    fn extract_instructions(messages: &[rushdino_common::models::Message]) -> String {
        messages
            .iter()
            .filter(|m| m.role == Role::System)
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn map_input(messages: &[rushdino_common::models::Message]) -> Vec<Value> {
        let mut input = Vec::new();

        for msg in messages {
            match msg.role {
                Role::System => {}
                Role::User => {
                    input.push(json!({ "role": "user", "content": msg.content }));
                }
                Role::Assistant => {
                    if let Some(calls) = &msg.tool_calls {
                        if !msg.content.is_empty() {
                            input.push(json!({
                                "role": "assistant",
                                "content": [{ "type": "output_text", "text": msg.content }]
                            }));
                        }
                        for call in calls {
                            let (call_id, item_id) = split_tool_call_id(&call.id);
                            let mut function_call = json!({
                                "type": "function_call",
                                "call_id": call_id,
                                "name": call.name,
                                "arguments": call.arguments.to_string()
                            });
                            if let Some(item_id) = item_id {
                                function_call["id"] = json!(item_id);
                            }
                            input.push(function_call);
                        }
                    } else {
                        input.push(json!({
                            "role": "assistant",
                            "content": [{ "type": "output_text", "text": msg.content }]
                        }));
                    }
                }
                Role::Tool => {
                    let (call_id, _) = split_tool_call_id(&msg.id);
                    input.push(json!({
                        "type": "function_call_output",
                        "call_id": call_id,
                        "output": msg.content
                    }));
                }
            }
        }
        input
    }

    fn map_tools(tools: Vec<ToolDefinition>) -> Vec<Value> {
        tools
            .into_iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                })
            })
            .collect()
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
        let (tx, rx) = mpsc::channel(128);
        let model_id = request.model.clone().unwrap_or_else(|| self.model.clone());
        let instructions = Self::extract_instructions(&request.messages);
        let input = Self::map_input(&request.messages);

        let body = json!({
            "model": model_id,
            "instructions": instructions,
            "input": input,
            "stream": true,
            "store": false,
            "text": { "verbosity": "medium" },
            "include": ["reasoning.encrypted_content"],
            "tool_choice": "auto",
            "parallel_tool_calls": true,
        });

        // Optional: Map tools
        let mut full_body = body;
        if let Some(tools) = request.tools {
            full_body["tools"] = json!(Self::map_tools(tools));
        }

        tracing::debug!(body = %serde_json::to_string_pretty(&full_body).unwrap_or_default(), "codex stream_chat request");

        let client = self.client.clone();
        let headers = self.build_headers()?;
        let url = self.resolve_url();

        tokio::spawn(async move {
            let mut response = None;

            for attempt in 0..=MAX_RETRIES {
                let res = client
                    .post(&url)
                    .headers(headers.clone())
                    .json(&full_body)
                    .timeout(Duration::from_secs(120))
                    .send()
                    .await;

                match res {
                    Ok(r) if r.status().is_success() => {
                        response = Some(r);
                        break;
                    }
                    Ok(r) => {
                        let status = r.status().as_u16();
                        let is_retryable = matches!(status, 429 | 500 | 502 | 503 | 504);
                        if attempt < MAX_RETRIES && is_retryable {
                            let delay = Duration::from_millis(BASE_DELAY_MS * 2u64.pow(attempt));
                            tokio::time::sleep(delay).await;
                            continue;
                        }
                        let err_msg = Self::parse_codex_error(r).await;
                        let _ = tx
                            .send(ChatChunk {
                                delta: err_msg,
                                tool_calls: vec![],
                                done: true,
                            })
                            .await;
                        return;
                    }
                    Err(e) if attempt < MAX_RETRIES => {
                        let delay = Duration::from_millis(BASE_DELAY_MS * 2u64.pow(attempt));
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                    Err(e) => {
                        let _ = tx
                            .send(ChatChunk {
                                delta: format!("Request failed: {e}"),
                                tool_calls: vec![],
                                done: true,
                            })
                            .await;
                        return;
                    }
                }
            }

            let Some(res) = response else {
                return;
            };
            let mut stream = res.bytes_stream();
            let mut buffer = String::new();
            let mut pending_calls: HashMap<String, (String, String)> = HashMap::new();

            while let Some(item) = stream.next().await {
                let Ok(chunk) = item else { break };
                buffer.push_str(&String::from_utf8_lossy(&chunk));

                while let Some(idx) = buffer.find("\n\n") {
                    let chunk_text = buffer[..idx].to_owned();
                    buffer = buffer[idx + 2..].to_owned();

                    for line in chunk_text.lines() {
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
                                })
                                .await;
                            return;
                        }

                        let Ok(event) = serde_json::from_str::<Value>(data) else {
                            continue;
                        };
                        let event_type = event
                            .get("type")
                            .and_then(Value::as_str)
                            .unwrap_or_default();

                        match event_type {
                            "response.output_text.delta" => {
                                let delta = event
                                    .get("delta")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_owned();
                                if !delta.is_empty() {
                                    let _ = tx
                                        .send(ChatChunk {
                                            delta,
                                            tool_calls: vec![],
                                            done: false,
                                        })
                                        .await;
                                }
                            }
                            "response.output_item.added" => {
                                if let Some(item) = event.get("item") {
                                    if item.get("type").and_then(Value::as_str)
                                        == Some("function_call")
                                    {
                                        let call_id = item
                                            .get("call_id")
                                            .and_then(Value::as_str)
                                            .unwrap_or_default()
                                            .to_owned();
                                        let name = item
                                            .get("name")
                                            .and_then(Value::as_str)
                                            .unwrap_or_default()
                                            .to_owned();
                                        if call_id.is_empty() || name.is_empty() {
                                            tracing::warn!(
                                                call_id = %call_id,
                                                name = %name,
                                                item = ?item,
                                                "skipping malformed function_call item: missing call_id or name"
                                            );
                                        } else {
                                            pending_calls.insert(call_id, (name, String::new()));
                                        }
                                    }
                                }
                            }
                            "response.function_call_arguments.delta" => {
                                let call_id_val = event
                                    .get("call_id")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default();
                                let delta = event
                                    .get("delta")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default();
                                if let Some(entry) = pending_calls.get_mut(call_id_val) {
                                    entry.1.push_str(delta);
                                }
                            }
                            "response.output_item.done" => {
                                if let Some(item) = event.get("item") {
                                    if item.get("type").and_then(Value::as_str)
                                        == Some("function_call")
                                    {
                                        let call_id = item
                                            .get("call_id")
                                            .and_then(Value::as_str)
                                            .unwrap_or_default()
                                            .to_owned();
                                        let item_id = item
                                            .get("id")
                                            .and_then(Value::as_str)
                                            .filter(|value| !value.is_empty())
                                            .map(str::to_owned);
                                        if let Some((name, args_str)) =
                                            pending_calls.remove(&call_id)
                                        {
                                            let arguments = serde_json::from_str(&args_str)
                                                .unwrap_or_else(|_| json!({}));
                                            let tool_call = ToolCall {
                                                id: compose_tool_call_id(
                                                    &call_id,
                                                    item_id.as_deref(),
                                                ),
                                                name,
                                                arguments,
                                            };
                                            let _ = tx
                                                .send(ChatChunk {
                                                    delta: String::new(),
                                                    tool_calls: vec![tool_call],
                                                    done: false,
                                                })
                                                .await;
                                        }
                                    }
                                }
                            }
                            "response.done" | "response.completed" => {
                                let _ = tx
                                    .send(ChatChunk {
                                        delta: String::new(),
                                        tool_calls: vec![],
                                        done: true,
                                    })
                                    .await;
                                return;
                            }
                            "error" => {
                                let msg = event
                                    .get("message")
                                    .and_then(Value::as_str)
                                    .unwrap_or("Unknown Codex error");
                                let _ = tx
                                    .send(ChatChunk {
                                        delta: format!("Error: {msg}"),
                                        tool_calls: vec![],
                                        done: true,
                                    })
                                    .await;
                                return;
                            }
                            _ => {}
                        }
                    }
                }
            }

            let _ = tx
                .send(ChatChunk {
                    delta: String::new(),
                    tool_calls: vec![],
                    done: true,
                })
                .await;
        });

        Ok(rx)
    }

    pub async fn list_models(&self) -> Result<Vec<ModelInfo>> {
        Ok(vec![
            ModelInfo {
                id: "gpt-5.3-codex".to_owned(),
                name: Some("GPT-5.3 Codex".to_owned()),
                description: Some("Latest Codex code generation model".to_owned()),
                context_window: Some(256_000),
                is_reasoning: Some(false),
            },
            ModelInfo {
                id: "codex-mini-latest".to_owned(),
                name: Some("Codex Mini".to_owned()),
                description: Some("Fast, lightweight Codex model".to_owned()),
                context_window: Some(200_000),
                is_reasoning: Some(false),
            },
        ])
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use rushdino_common::models::{Message, Role, ToolCall};

    use super::CodexResponsesProvider;

    #[test]
    fn map_input_preserves_responses_function_call_item_id() {
        let messages = vec![
            Message {
                id: "assistant-1".to_owned(),
                role: Role::Assistant,
                content: String::new(),
                tool_calls: Some(vec![ToolCall {
                    id: "call_123|fc_456".to_owned(),
                    name: "shell_exec".to_owned(),
                    arguments: json!({ "command": "pwd" }),
                }]),
                rich_content: None,
                created_at: chrono::Utc::now(),
            },
            Message {
                id: "call_123|fc_456".to_owned(),
                role: Role::Tool,
                content: "ok".to_owned(),
                tool_calls: None,
                rich_content: None,
                created_at: chrono::Utc::now(),
            },
        ];

        let input = CodexResponsesProvider::map_input(&messages);

        assert_eq!(input[0]["type"], "function_call");
        assert_eq!(input[0]["call_id"], "call_123");
        assert_eq!(input[0]["id"], "fc_456");
        assert_eq!(input[1]["type"], "function_call_output");
        assert_eq!(input[1]["call_id"], "call_123");
        assert_eq!(input[1]["output"], "ok");
    }

    #[test]
    fn map_input_keeps_plain_tool_call_ids_unchanged() {
        let messages = vec![Message {
            id: "call_plain".to_owned(),
            role: Role::Tool,
            content: "ok".to_owned(),
            tool_calls: None,
            rich_content: None,
            created_at: chrono::Utc::now(),
        }];

        let input = CodexResponsesProvider::map_input(&messages);

        assert_eq!(input[0]["call_id"], "call_plain");
        assert!(input[0].get("id").is_none());
    }
}
