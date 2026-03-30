//! Shared utilities for the OpenAI Responses API.
//!
//! Translated from `openai_responses_shared.ts`.  Contains:
//! - Message conversion (`convertResponsesMessages`)
//! - Tool conversion (`convertResponsesTools`)
//! - Stream processing (`processResponsesStream`)
//!
//! Used by both `responses.rs` (direct OpenAI) and `codex_responses.rs` (Codex).

use std::collections::HashMap;

use futures::StreamExt;
use reqwest::Response;
use serde_json::{json, Value};
use tokio::sync::mpsc;

use rushdino_common::models::ToolCall;

use crate::types::{ChatChunk, ToolDefinition};

/// Normalise a single tool call ID for the Responses API.
///
/// Providers in `allowed_providers` use the pipe-separated `{call_id}|{item_id}`
/// format when passing IDs back from a previous Responses-API session.
/// Others keep IDs as-is.
pub fn normalize_responses_tool_call_id(id: &str, allowed: bool) -> String {
    if !allowed || !id.contains('|') {
        return id.to_owned();
    }

    let mut parts = id.splitn(2, '|');
    let call_id = parts.next().unwrap_or("");
    let item_id = parts.next().unwrap_or("");

    // Sanitise: only alphanumeric, dash, underscore
    let sanitize = |s: &str| -> String {
        s.chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect()
    };

    let mut sanitized_call = sanitize(call_id);
    let item_sanitized = sanitize(item_id);

    // Responses API requires item_id to start with "fc_"
    let mut sanitized_item = if !item_sanitized.starts_with("fc_") {
        format!("fc_{}", item_sanitized)
    } else {
        item_sanitized
    };

    // Truncate to 64 chars and strip trailing underscores
    if sanitized_call.len() > 64 {
        sanitized_call.truncate(64);
    }
    if sanitized_item.len() > 64 {
        sanitized_item.truncate(64);
    }
    let sanitized_call = sanitized_call.trim_end_matches('_').to_owned();
    let sanitized_item = sanitized_item.trim_end_matches('_').to_owned();

    format!("{}|{}", sanitized_call, sanitized_item)
}

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

/// Options for `convert_responses_messages`.
#[derive(Debug, Clone, Default)]
pub struct ConvertResponsesMessagesOptions {
    /// Whether to prepend the system prompt (default: true).
    pub include_system_prompt: bool,
}

/// Convert internal messages to the Responses API `input` array.
/// Mirrors `convertResponsesMessages` in the TypeScript source.
pub fn convert_responses_messages(
    messages: &[rushdino_common::models::Message],
    system_prompt: Option<&str>,
    is_reasoning_model: bool,
    _is_image_input: bool,
    allowed_tool_call_providers: &std::collections::HashSet<String>,
    provider: &str,
    options: &ConvertResponsesMessagesOptions,
) -> Vec<Value> {
    use rushdino_common::models::Role;

    let allowed = allowed_tool_call_providers.contains(provider);
    let mut result: Vec<Value> = Vec::new();

    // System / developer prompt
    if options.include_system_prompt {
        if let Some(sys) = system_prompt {
            let role = if is_reasoning_model {
                "developer"
            } else {
                "system"
            };
            result.push(json!({ "role": role, "content": sys }));
        }
    }

    for (msg_index, msg) in messages.iter().enumerate() {
        match msg.role {
            Role::System => {
                // Inline system messages are skipped; handled via `system_prompt` param
            }

            Role::User => {
                result.push(json!({
                    "role": "user",
                    "content": [{
                        "type": "input_text",
                        "text": &msg.content
                    }]
                }));
            }

            Role::Assistant => {
                let mut output: Vec<Value> = Vec::new();

                // Text block
                if !msg.content.trim().is_empty() {
                    // Derive a stable message ID
                    let msg_id = format!("msg_{}", msg_index);
                    output.push(json!({
                        "type": "message",
                        "role": "assistant",
                        "content": [{
                            "type": "output_text",
                            "text": &msg.content,
                            "annotations": []
                        }],
                        "status": "completed",
                        "id": msg_id
                    }));
                }

                // Tool calls → function_call items
                if let Some(calls) = &msg.tool_calls {
                    for call in calls {
                        let id_normalized = normalize_responses_tool_call_id(&call.id, allowed);
                        let (call_id, item_id) = match id_normalized.split_once('|') {
                            Some((a, b)) => (a, Some(b)),
                            None => (id_normalized.as_str(), None),
                        };

                        let mut fc = json!({
                            "type": "function_call",
                            "call_id": call_id,
                            "name": call.name,
                            "arguments": call.arguments.to_string()
                        });
                        if let Some(iid) = item_id {
                            fc["id"] = json!(iid);
                        }
                        output.push(fc);
                    }
                }

                if !output.is_empty() {
                    result.extend(output);
                }
            }

            Role::Tool => {
                // id is a plain String — split on pipe to extract call_id
                let call_id = msg.id.split('|').next().unwrap_or(&msg.id);

                result.push(json!({
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": &msg.content
                }));
            }
        }
    }

    result
}

// ---------------------------------------------------------------------------
// Tool conversion
// ---------------------------------------------------------------------------

/// Convert internal `ToolDefinition` list to Responses-API tool format.
/// Mirrors `convertResponsesTools` in the TypeScript source.
pub fn convert_responses_tools(tools: &[ToolDefinition], strict: Option<bool>) -> Vec<Value> {
    let strict_val = strict.unwrap_or(false);
    tools
        .iter()
        .map(|tool| {
            json!({
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
                "strict": strict_val
            })
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Stream event processing
// ---------------------------------------------------------------------------

/// Process a streaming Responses-API SSE byte stream and forward `ChatChunk`s
/// to `tx`. Mirrors `processResponsesStream` in the TypeScript source.
///
/// Each line of the stream is expected to be `data: <json>` (SSE format).
pub async fn process_responses_stream(response: Response, tx: mpsc::Sender<ChatChunk>) {
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    // Active tool calls: call_id -> (name, partial_args)
    let mut pending_calls: HashMap<String, (String, String)> = HashMap::new();
    // Responses argument deltas are keyed by item_id, not call_id.
    let mut item_to_call: HashMap<String, String> = HashMap::new();

    while let Some(item) = stream.next().await {
        let Ok(chunk) = item else { break };
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Split on double-newline (SSE event delimiter)
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
                            usage: None,
                            thinking_delta: None,
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
                    // -------------------------- Output item added --------------------------
                    "response.output_item.added" => {
                        if let Some(item_obj) = event.get("item") {
                            let item_type = item_obj
                                .get("type")
                                .and_then(Value::as_str)
                                .unwrap_or_default();
                            // (item_type tracking removed — only function_call needs handling)

                            if item_type == "function_call" {
                                let item_id = item_obj
                                    .get("id")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_owned();
                                let call_id = item_obj
                                    .get("call_id")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_owned();
                                let name = item_obj
                                    .get("name")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_owned();
                                if !item_id.is_empty() && !call_id.is_empty() {
                                    item_to_call.insert(item_id, call_id.clone());
                                }
                                pending_calls
                                    .entry(call_id)
                                    .or_insert((name, String::new()));
                            }
                        }
                    }

                    // -------------------------- Text delta ---------------------------------
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
                                    usage: None,
                                    thinking_delta: None,
                                })
                                .await;
                        }
                    }

                    // -------------------------- Refusal delta ------------------------------
                    "response.refusal.delta" => {
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
                                    usage: None,
                                    thinking_delta: None,
                                })
                                .await;
                        }
                    }

                    // -------------------------- Function call arguments delta --------------
                    "response.function_call_arguments.delta" => {
                        let direct_call_id = event
                            .get("call_id")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let item_id = event
                            .get("item_id")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let delta = event
                            .get("delta")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let resolved_call_id = if !direct_call_id.is_empty() {
                            direct_call_id
                        } else {
                            item_to_call
                                .get(item_id)
                                .map(String::as_str)
                                .unwrap_or_default()
                        };
                        if let Some(entry) = pending_calls.get_mut(resolved_call_id) {
                            entry.1.push_str(delta);
                        }
                    }

                    // -------------------------- Output item done ---------------------------
                    "response.output_item.done" => {
                        if let Some(item_obj) = event.get("item") {
                            let item_type = item_obj
                                .get("type")
                                .and_then(Value::as_str)
                                .unwrap_or_default();

                            if item_type == "function_call" {
                                let item_arguments = item_obj
                                    .get("arguments")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_owned();
                                let call_id = item_obj
                                    .get("call_id")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_owned();
                                let item_obj_id = item_obj
                                    .get("id")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_owned();
                                if !item_obj_id.is_empty() {
                                    item_to_call.remove(&item_obj_id);
                                }

                                if let Some((name, args_str)) = pending_calls.remove(&call_id) {
                                    let final_args = if args_str.is_empty() {
                                        item_arguments.as_str()
                                    } else {
                                        args_str.as_str()
                                    };
                                    let arguments = serde_json::from_str(final_args)
                                        .unwrap_or_else(|_| json!({}));
                                    // Encode as "call_id|item_id" to preserve both IDs
                                    let id = if item_obj_id.is_empty() {
                                        call_id.clone()
                                    } else {
                                        format!("{}|{}", call_id, item_obj_id)
                                    };
                                    let _ = tx
                                        .send(ChatChunk {
                                            delta: String::new(),
                                            tool_calls: vec![ToolCall {
                                                id,
                                                name,
                                                arguments,
                                            }],
                                            done: false,
                                            usage: None,
                                            thinking_delta: None,
                                        })
                                        .await;
                                }
                            }
                        }
                    }

                    // -------------------------- Completion ---------------------------------
                    "response.completed" | "response.done" => {
                        let _ = tx
                            .send(ChatChunk {
                                delta: String::new(),
                                tool_calls: vec![],
                                done: true,
                                usage: None,
                                thinking_delta: None,
                            })
                            .await;
                        return;
                    }

                    // -------------------------- Error ------------------------------------
                    "error" => {
                        let code = event
                            .get("code")
                            .and_then(Value::as_str)
                            .unwrap_or("unknown");
                        let msg = event
                            .get("message")
                            .and_then(Value::as_str)
                            .unwrap_or("Unknown error");
                        let _ = tx
                            .send(ChatChunk {
                                delta: format!("Error {code}: {msg}"),
                                tool_calls: vec![],
                                done: true,
                                usage: None,
                                thinking_delta: None,
                            })
                            .await;
                        return;
                    }

                    "response.failed" => {
                        let _ = tx
                            .send(ChatChunk {
                                delta: "Response failed".to_owned(),
                                tool_calls: vec![],
                                done: true,
                                usage: None,
                                thinking_delta: None,
                            })
                            .await;
                        return;
                    }

                    // Reasoning / thinking events — forward as thinking_delta
                    "response.reasoning_summary_text.delta" => {
                        if let Some(text) = event.get("delta").and_then(Value::as_str) {
                            let _ = tx
                                .send(ChatChunk {
                                    delta: String::new(),
                                    tool_calls: vec![],
                                    done: false,
                                    usage: None,
                                    thinking_delta: Some(text.to_owned()),
                                })
                                .await;
                        }
                    }

                    _ => {} // All other events are silently ignored
                }
            }
        }
    }

    // Stream ended without explicit done / completed event
    let _ = tx
        .send(ChatChunk {
            delta: String::new(),
            tool_calls: vec![],
            done: true,
            usage: None,
            thinking_delta: None,
        })
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use rushdino_common::models::{Message, Role};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn make_message(role: Role, content: &str) -> Message {
        Message {
            id: "msg-1".to_owned(),
            role,
            content: content.to_owned(),
            tool_calls: None,
            rich_content: None,
            thinking: None,
            created_at: chrono::Utc::now(),
        }
    }

    fn no_providers() -> std::collections::HashSet<String> {
        std::collections::HashSet::new()
    }

    fn default_opts() -> ConvertResponsesMessagesOptions {
        ConvertResponsesMessagesOptions { include_system_prompt: true }
    }

    // -----------------------------------------------------------------------
    // convert_responses_messages — empty-input edge cases
    // -----------------------------------------------------------------------

    #[test]
    fn empty_messages_with_no_system_prompt_returns_empty_vec() {
        // This is the pathological case: both conversation and system_prompt are
        // absent.  The caller is responsible for guarding against an empty result.
        let result = convert_responses_messages(
            &[],
            None,
            false,
            false,
            &no_providers(),
            "",
            &default_opts(),
        );
        assert!(
            result.is_empty(),
            "no messages + no system prompt must produce an empty vec"
        );
    }

    #[test]
    fn empty_messages_with_system_prompt_returns_system_entry() {
        // Even with no conversation messages, the system prompt should be
        // emitted so `input` is non-empty for the Responses API.
        let result = convert_responses_messages(
            &[],
            Some("You are helpful."),
            false,
            false,
            &no_providers(),
            "",
            &default_opts(),
        );
        assert_eq!(result.len(), 1, "system prompt must produce one entry");
        assert_eq!(result[0]["role"], "system");
    }

    #[test]
    fn system_only_conversation_filters_to_just_system_prompt() {
        // The conversation list may contain a System message (inline); it must
        // be skipped because it is handled via the system_prompt parameter.
        let messages = vec![make_message(Role::System, "inline system")];
        let result = convert_responses_messages(
            &messages,
            Some("header prompt"),
            false,
            false,
            &no_providers(),
            "",
            &default_opts(),
        );
        // The header prompt is emitted; the inline system message is skipped.
        assert_eq!(result.len(), 1);
        assert_eq!(result[0]["role"], "system");
        assert_eq!(result[0]["content"], "header prompt");
    }

    #[test]
    fn include_system_prompt_false_skips_system_entry() {
        // Codex path: system prompt goes to `instructions`, not `input`.
        let opts = ConvertResponsesMessagesOptions { include_system_prompt: false };
        let result = convert_responses_messages(
            &[],
            Some("instructions"),
            false,
            false,
            &no_providers(),
            "",
            &opts,
        );
        assert!(
            result.is_empty(),
            "with include_system_prompt=false and no other messages the result must be empty"
        );
    }

    #[test]
    fn user_message_is_converted_to_input_text_block() {
        let messages = vec![make_message(Role::User, "hello world")];
        let result = convert_responses_messages(
            &messages,
            None,
            false,
            false,
            &no_providers(),
            "",
            &ConvertResponsesMessagesOptions { include_system_prompt: false },
        );
        assert_eq!(result.len(), 1);
        assert_eq!(result[0]["role"], "user");
        assert_eq!(result[0]["content"][0]["type"], "input_text");
        assert_eq!(result[0]["content"][0]["text"], "hello world");
    }

    #[test]
    fn reasoning_model_uses_developer_role_for_system_prompt() {
        let result = convert_responses_messages(
            &[],
            Some("system text"),
            true, // is_reasoning_model
            false,
            &no_providers(),
            "",
            &default_opts(),
        );
        assert_eq!(result.len(), 1);
        assert_eq!(result[0]["role"], "developer");
    }

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

    #[tokio::test]
    async fn process_responses_stream_collects_function_call_arguments_from_item_id_deltas() {
        let sse_body = concat!(
            "data: {\"type\":\"response.output_item.added\",\"item\":{\"id\":\"fc_123\",\"type\":\"function_call\",\"call_id\":\"call_123\",\"name\":\"file_write\",\"arguments\":\"\"}}\n\n",
            "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_123\",\"output_index\":0,\"delta\":\"{\\\"path\\\":\\\"note.md\\\",\\\"content\\\":\\\"hello\\\"}\"}\n\n",
            "data: {\"type\":\"response.output_item.done\",\"item\":{\"id\":\"fc_123\",\"type\":\"function_call\",\"call_id\":\"call_123\",\"name\":\"file_write\",\"arguments\":\"{\\\"path\\\":\\\"note.md\\\",\\\"content\\\":\\\"hello\\\"}\"}}\n\n",
            "data: {\"type\":\"response.completed\"}\n\n",
        )
        .to_owned();

        let url = spawn_sse_server(sse_body).await;
        let response = reqwest::Client::new().get(&url).send().await.unwrap();
        let (tx, mut rx) = mpsc::channel(8);

        process_responses_stream(response, tx).await;

        let mut tool_calls = Vec::new();
        while let Some(chunk) = rx.recv().await {
            tool_calls.extend(chunk.tool_calls);
            if chunk.done {
                break;
            }
        }

        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].name, "file_write");
        assert_eq!(
            tool_calls[0].arguments,
            json!({
                "path": "note.md",
                "content": "hello"
            })
        );
    }
}
