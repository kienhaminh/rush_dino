use serde_json::{json, Value};

use rushdino_common::{models::ToolCall, Result};

use crate::types::{ChatResponse, Usage};

pub fn map_openai_message(message: &rushdino_common::models::Message) -> Value {
    let role = match message.role {
        rushdino_common::models::Role::System => "system",
        rushdino_common::models::Role::User => "user",
        rushdino_common::models::Role::Assistant => "assistant",
        rushdino_common::models::Role::Tool => "tool",
    };
    let mut base = json!({ "role": role, "content": message.content });
    if message.role == rushdino_common::models::Role::Tool {
        base["tool_call_id"] = Value::String(message.id.clone());
    }
    if let Some(calls) = &message.tool_calls {
        base["tool_calls"] = Value::Array(
            calls
                .iter()
                .map(|call| {
                    json!({
                        "id": call.id,
                        "type": "function",
                        "function": {"name": call.name, "arguments": call.arguments.to_string()}
                    })
                })
                .collect(),
        );
    }
    base
}

pub fn map_openai_tools(defs: Vec<crate::types::ToolDefinition>) -> Value {
    Value::Array(
        defs.into_iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters,
                    }
                })
            })
            .collect(),
    )
}

pub fn parse_openai_response(payload: &Value) -> Result<ChatResponse> {
    let content = payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();

    let tool_calls = parse_tool_calls(payload.pointer("/choices/0/message/tool_calls"));

    let finish_reason = payload
        .pointer("/choices/0/finish_reason")
        .and_then(Value::as_str)
        .unwrap_or("stop")
        .to_owned();

    let usage = payload.pointer("/usage").and_then(|usage| {
        let prompt = usage.get("prompt_tokens")?.as_u64()? as u32;
        let completion = usage.get("completion_tokens")?.as_u64()? as u32;
        let total = usage.get("total_tokens")?.as_u64()? as u32;
        Some(Usage {
            prompt_tokens: prompt,
            completion_tokens: completion,
            total_tokens: total,
        })
    });

    Ok(ChatResponse {
        content,
        tool_calls,
        rich_content: None,
        usage,
        finish_reason,
    })
}

pub fn parse_tool_calls(input: Option<&Value>) -> Vec<ToolCall> {
    let Some(Value::Array(calls)) = input else {
        return Vec::new();
    };

    calls
        .iter()
        .map(|call| {
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
            let args_str = call
                .pointer("/function/arguments")
                .and_then(Value::as_str)
                .unwrap_or("{}");
            let arguments = serde_json::from_str(args_str).unwrap_or_else(|_| json!({}));

            ToolCall {
                id,
                name,
                arguments,
            }
        })
        .collect()
}
