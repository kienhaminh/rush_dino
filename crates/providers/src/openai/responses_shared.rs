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
    let mut msg_index: usize = 0;

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

    for msg in messages {
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
                        let parts: Vec<&str> = id_normalized.splitn(2, '|').collect();
                        let call_id = parts[0];
                        let item_id: Option<&str> = parts.get(1).copied();

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
                let call_id = msg.id.splitn(2, '|').next().unwrap_or(&msg.id);

                result.push(json!({
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": &msg.content
                }));
            }
        }

        msg_index += 1;
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
                                })
                                .await;
                        }
                    }

                    // -------------------------- Function call arguments delta --------------
                    "response.function_call_arguments.delta" => {
                        let call_id = event
                            .get("call_id")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let delta = event
                            .get("delta")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        if let Some(entry) = pending_calls.get_mut(call_id) {
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

                                if let Some((name, args_str)) = pending_calls.remove(&call_id) {
                                    let arguments = serde_json::from_str(&args_str)
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
                            })
                            .await;
                        return;
                    }

                    // Reasoning / thinking events — forward as empty delta (not user-visible)
                    "response.reasoning_summary_text.delta" => {
                        // Thinking text; currently not forwarded as user-visible delta
                        // (callers can extend this if they need thinking blocks)
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
        })
        .await;
}
