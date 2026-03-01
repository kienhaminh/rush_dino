use std::sync::Arc;

use chrono::Utc;
use futures::future::join_all;
use uuid::Uuid;

use rushdino_common::{models::{Message, Role, ToolCall}, AppError, Result};
use rushdino_providers::{types::{ChatChunk, ChatRequest, ChatResponse}, Provider};
use tokio::sync::mpsc;

use crate::{context::truncate_messages, engine::AgentConfig, tool_registry::ToolRegistry};

#[derive(Debug, Clone)]
pub enum StreamingEvent {
    ChatChunk(ChatChunk),
    AssistantReset,
}

pub async fn run_react_loop(
    provider: Arc<Provider>,
    registry: Arc<ToolRegistry>,
    mut messages: Vec<Message>,
    config: &AgentConfig,
) -> Result<(ChatResponse, Vec<Message>)> {
    let mut last = None;

    for _ in 0..config.max_iterations {
        let input = truncate_messages(&messages, config.max_context_tokens);
        let response = provider.chat(build_chat_request(input, &registry)).await?;

        let assistant_message = Message {
            id: Uuid::new_v4().to_string(),
            role: Role::Assistant,
            content: response.content.clone(),
            tool_calls: Some(response.tool_calls.clone()).filter(|x| !x.is_empty()),
            created_at: Utc::now(),
        };
        messages.push(assistant_message);

        if response.tool_calls.is_empty() {
            return Ok((response, messages));
        }

        append_tool_outputs(&mut messages, registry.clone(), response.tool_calls.clone()).await;

        last = Some(response);
    }

    let fallback = last.ok_or_else(|| AppError::Agent("empty ReAct execution".to_owned()))?;
    Ok((fallback, messages))
}

pub async fn run_react_loop_streaming(
    provider: Arc<Provider>,
    registry: Arc<ToolRegistry>,
    mut messages: Vec<Message>,
    config: &AgentConfig,
    event_tx: mpsc::Sender<StreamingEvent>,
) -> Result<(ChatResponse, Vec<Message>)> {
    let mut last = None;

    for _ in 0..config.max_iterations {
        let input = truncate_messages(&messages, config.max_context_tokens);
        let mut stream = provider
            .stream_chat(build_chat_request(input, &registry))
            .await?;

        let mut content = String::new();
        let mut tool_calls: Vec<ToolCall> = Vec::new();
        let mut emitted_text = false;

        while let Some(chunk) = stream.recv().await {
            if !chunk.tool_calls.is_empty() {
                if emitted_text {
                    emitted_text = false;
                    content.clear();
                    let _ = event_tx.send(StreamingEvent::AssistantReset).await;
                }
                tool_calls.extend(chunk.tool_calls);
            }

            if !chunk.delta.is_empty() && tool_calls.is_empty() {
                emitted_text = true;
                content.push_str(&chunk.delta);
                let _ = event_tx
                    .send(StreamingEvent::ChatChunk(ChatChunk {
                        delta: chunk.delta,
                        tool_calls: Vec::new(),
                        done: false,
                    }))
                    .await;
            }

            if chunk.done {
                break;
            }
        }

        if tool_calls.is_empty() {
            let final_response = ChatResponse {
                content: content.clone(),
                tool_calls: Vec::new(),
                usage: None,
                finish_reason: "stop".to_owned(),
            };
            messages.push(Message {
                id: Uuid::new_v4().to_string(),
                role: Role::Assistant,
                content,
                tool_calls: None,
                created_at: Utc::now(),
            });
            let _ = event_tx
                .send(StreamingEvent::ChatChunk(ChatChunk {
                    delta: String::new(),
                    tool_calls: Vec::new(),
                    done: true,
                }))
                .await;
            return Ok((final_response, messages));
        }

        let response = ChatResponse {
            content,
            tool_calls: tool_calls.clone(),
            usage: None,
            finish_reason: "tool_calls".to_owned(),
        };

        messages.push(Message {
            id: Uuid::new_v4().to_string(),
            role: Role::Assistant,
            content: response.content.clone(),
            tool_calls: Some(tool_calls),
            created_at: Utc::now(),
        });

        append_tool_outputs(&mut messages, registry.clone(), response.tool_calls.clone()).await;
        last = Some(response);
    }

    let fallback = last.ok_or_else(|| AppError::Agent("empty ReAct execution".to_owned()))?;
    let _ = event_tx
        .send(StreamingEvent::ChatChunk(ChatChunk {
            delta: String::new(),
            tool_calls: Vec::new(),
            done: true,
        }))
        .await;
    Ok((fallback, messages))
}

fn build_chat_request(messages: Vec<Message>, registry: &ToolRegistry) -> ChatRequest {
    ChatRequest {
        messages,
        tools: Some(registry.definitions()),
        temperature: Some(0.2),
        max_tokens: Some(1200),
        model: None,
    }
}

async fn append_tool_outputs(
    messages: &mut Vec<Message>,
    registry: Arc<ToolRegistry>,
    calls: Vec<ToolCall>,
) {
    let futures = calls.into_iter().map(|call| {
        let registry = registry.clone();
        async move {
            if let Some(tool) = registry.get(&call.name) {
                match tool.execute(call.arguments.clone()).await {
                    Ok(value) => (call, value, false),
                    Err(err) => (call, err.to_string(), true),
                }
            } else {
                (call, "tool not found".to_owned(), true)
            }
        }
    });

    for (call, output, is_error) in join_all(futures).await {
        let payload = if is_error {
            format!("[tool_error:{}] {output}", call.name)
        } else {
            output
        };
        messages.push(Message {
            id: Uuid::new_v4().to_string(),
            role: Role::Tool,
            content: payload,
            tool_calls: None,
            created_at: Utc::now(),
        });
    }
}
