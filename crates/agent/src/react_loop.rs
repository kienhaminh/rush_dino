use std::sync::Arc;

use chrono::Utc;
use futures::future::join_all;
use uuid::Uuid;

use rushdino_common::{
    models::{Message, Role, ToolCall},
    AppError, Result, RichContent,
};
use rushdino_providers::{
    types::{ChatChunk, ChatRequest, ChatResponse, Usage},
    Provider,
};
use tokio::sync::mpsc;

use rushdino_security::{taint::TaintLevel, validation::scan_prompt_injection};

use crate::{
    context::{estimate_tokens, truncate_messages},
    engine::AgentConfig,
    tool_registry::ToolRegistry,
};

/// Compute the minimum taint level for tool arguments based on the conversation messages.
///
/// Any user message makes the baseline at least `UserInput`, because the LLM's tool calls
/// are influenced by whatever the user sent.
fn compute_base_taint(messages: &[Message]) -> TaintLevel {
    if messages.iter().any(|m| m.role == Role::User) {
        TaintLevel::UserInput
    } else {
        TaintLevel::Clean
    }
}

#[derive(Debug, Clone)]
pub enum StreamingEvent {
    ChatChunk(ChatChunk),
    AssistantReset,
    ToolStart {
        tool_name: String,
        args: serde_json::Value,
    },
    ToolEnd {
        tool_name: String,
        result: String,
        is_error: bool,
    },
}

pub async fn run_react_loop(
    provider: Arc<Provider>,
    registry: Arc<ToolRegistry>,
    mut messages: Vec<Message>,
    config: &AgentConfig,
    event_tx: Option<mpsc::Sender<StreamingEvent>>,
) -> Result<(ChatResponse, Vec<Message>)> {
    let mut last = None;
    let mut total_usage: Option<Usage> = None;
    let mut last_presented_content: Option<RichContent> = None;

    for _ in 0..config.max_iterations {
        let input = truncate_messages(&messages, config.max_context_tokens);
        let response = provider
            .chat(build_chat_request(
                input.clone(),
                &registry,
                config.model_override.clone(),
            ))
            .await?;
        let iteration_usage = response.usage.clone().unwrap_or_else(|| {
            estimate_turn_usage(&input, &response.content, &response.tool_calls)
        });
        accumulate_usage(&mut total_usage, &iteration_usage);
        let mut response = response;
        response.usage = Some(iteration_usage);

        if response.tool_calls.is_empty() {
            finalize_response_content(&mut response, last_presented_content.take());
            let assistant_message = Message {
                id: Uuid::new_v4().to_string(),
                role: Role::Assistant,
                content: response.content.clone(),
                tool_calls: None,
                rich_content: response.rich_content.clone(),
                created_at: Utc::now(),
            };
            messages.push(assistant_message);
            response.usage = total_usage.clone();
            return Ok((response, messages));
        }

        let assistant_message = Message {
            id: Uuid::new_v4().to_string(),
            role: Role::Assistant,
            content: response.content.clone(),
            tool_calls: Some(response.tool_calls.clone()).filter(|x| !x.is_empty()),
            rich_content: None,
            created_at: Utc::now(),
        };
        messages.push(assistant_message);

        let base_taint = compute_base_taint(&messages);
        if let Some(rich_content) = append_tool_outputs(
            &mut messages,
            registry.clone(),
            response.tool_calls.clone(),
            base_taint,
            event_tx.as_ref(),
        )
        .await
        {
            last_presented_content = Some(rich_content);
        }

        last = Some(response);
    }

    let mut fallback = last.ok_or_else(|| AppError::Agent("empty ReAct execution".to_owned()))?;
    fallback.usage = total_usage;
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
    let mut total_usage: Option<Usage> = None;
    let mut last_presented_content: Option<RichContent> = None;

    for _ in 0..config.max_iterations {
        let input = truncate_messages(&messages, config.max_context_tokens);
        let mut stream = provider
            .stream_chat(build_chat_request(
                input.clone(),
                &registry,
                config.model_override.clone(),
            ))
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

        let iteration_usage = estimate_turn_usage(&input, &content, &tool_calls);
        accumulate_usage(&mut total_usage, &iteration_usage);

        if tool_calls.is_empty() {
            let mut final_response = ChatResponse {
                content,
                tool_calls: Vec::new(),
                rich_content: None,
                usage: total_usage.clone(),
                finish_reason: "stop".to_owned(),
            };
            finalize_response_content(&mut final_response, last_presented_content.take());
            messages.push(Message {
                id: Uuid::new_v4().to_string(),
                role: Role::Assistant,
                content: final_response.content.clone(),
                tool_calls: None,
                rich_content: final_response.rich_content.clone(),
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
            rich_content: None,
            usage: Some(iteration_usage),
            finish_reason: "tool_calls".to_owned(),
        };

        messages.push(Message {
            id: Uuid::new_v4().to_string(),
            role: Role::Assistant,
            content: response.content.clone(),
            tool_calls: Some(tool_calls),
            rich_content: None,
            created_at: Utc::now(),
        });

        let base_taint = compute_base_taint(&messages);
        if let Some(rich_content) = append_tool_outputs(
            &mut messages,
            registry.clone(),
            response.tool_calls.clone(),
            base_taint,
            Some(&event_tx),
        )
        .await
        {
            last_presented_content = Some(rich_content);
        }
        last = Some(response);
    }

    let mut fallback = last.ok_or_else(|| AppError::Agent("empty ReAct execution".to_owned()))?;
    fallback.usage = total_usage;
    let _ = event_tx
        .send(StreamingEvent::ChatChunk(ChatChunk {
            delta: String::new(),
            tool_calls: Vec::new(),
            done: true,
        }))
        .await;
    Ok((fallback, messages))
}

fn finalize_response_content(response: &mut ChatResponse, presented_content: Option<RichContent>) {
    let rich_content =
        presented_content.unwrap_or_else(|| RichContent::from_markdown(response.content.clone()));
    response.content = rich_content.fallback_text.clone();
    response.rich_content = Some(rich_content);
}

fn build_chat_request(
    messages: Vec<Message>,
    registry: &ToolRegistry,
    model: Option<String>,
) -> ChatRequest {
    ChatRequest {
        messages,
        tools: Some(registry.definitions()),
        temperature: Some(0.2),
        max_tokens: Some(1200),
        model,
    }
}

fn accumulate_usage(total: &mut Option<Usage>, usage: &Usage) {
    match total {
        Some(current) => {
            current.prompt_tokens = current.prompt_tokens.saturating_add(usage.prompt_tokens);
            current.completion_tokens = current
                .completion_tokens
                .saturating_add(usage.completion_tokens);
            current.total_tokens = current.total_tokens.saturating_add(usage.total_tokens);
        }
        None => {
            *total = Some(usage.clone());
        }
    }
}

fn estimate_turn_usage(messages: &[Message], content: &str, tool_calls: &[ToolCall]) -> Usage {
    let prompt_tokens = messages
        .iter()
        .map(|message| estimate_tokens(&message.content) as u32)
        .sum::<u32>();
    let tool_call_tokens = tool_calls
        .iter()
        .map(estimate_tool_call_tokens)
        .sum::<u32>();
    let completion_tokens = (estimate_tokens(content) as u32).saturating_add(tool_call_tokens);

    Usage {
        prompt_tokens,
        completion_tokens,
        total_tokens: prompt_tokens.saturating_add(completion_tokens),
    }
}

fn estimate_tool_call_tokens(call: &ToolCall) -> u32 {
    let arguments = serde_json::to_string(&call.arguments).unwrap_or_default();
    let rendered = format!("{} {}", call.name, arguments);
    estimate_tokens(&rendered) as u32
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use chrono::Utc;
    use serde_json::json;

    use rushdino_common::models::Role;
    use rushdino_security::taint::TaintLevel;

    use super::{
        accumulate_usage, append_tool_outputs, estimate_turn_usage, Message, ToolCall, Usage,
    };
    use crate::{tool_registry::ToolRegistry, tools::present_message::PresentMessageTool};

    #[test]
    fn accumulates_usage_across_iterations() {
        let mut total = None;
        accumulate_usage(
            &mut total,
            &Usage {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            },
        );
        accumulate_usage(
            &mut total,
            &Usage {
                prompt_tokens: 20,
                completion_tokens: 8,
                total_tokens: 28,
            },
        );

        let total = total.expect("usage should be accumulated");
        assert_eq!(total.prompt_tokens, 30);
        assert_eq!(total.completion_tokens, 13);
        assert_eq!(total.total_tokens, 43);
    }

    #[test]
    fn estimates_turn_usage_from_messages_and_tool_calls() {
        let messages = vec![
            Message {
                id: "1".to_owned(),
                role: Role::System,
                content: "system prompt".to_owned(),
                tool_calls: None,
                rich_content: None,
                created_at: Utc::now(),
            },
            Message {
                id: "2".to_owned(),
                role: Role::User,
                content: "user prompt".to_owned(),
                tool_calls: None,
                rich_content: None,
                created_at: Utc::now(),
            },
        ];
        let tool_calls = vec![ToolCall {
            id: "call-1".to_owned(),
            name: "search".to_owned(),
            arguments: json!({ "q": "metrics" }),
        }];

        let usage = estimate_turn_usage(&messages, "assistant output", &tool_calls);
        assert!(usage.prompt_tokens > 0);
        assert!(usage.completion_tokens > 0);
        assert_eq!(
            usage.total_tokens,
            usage.prompt_tokens + usage.completion_tokens
        );
    }

    #[tokio::test]
    async fn last_present_message_call_wins() {
        let mut registry = ToolRegistry::new();
        registry.register(PresentMessageTool::new());

        let mut messages = Vec::new();
        let rich_content = append_tool_outputs(
            &mut messages,
            Arc::new(registry),
            vec![
                ToolCall {
                    id: "call-1".to_owned(),
                    name: "present_message".to_owned(),
                    arguments: json!({
                        "fallbackText": "First",
                        "blocks": [
                            {
                                "type": "formatted_text",
                                "text": "First",
                                "format": "plain_text"
                            }
                        ]
                    }),
                },
                ToolCall {
                    id: "call-2".to_owned(),
                    name: "present_message".to_owned(),
                    arguments: json!({
                        "fallbackText": "Second",
                        "blocks": [
                            {
                                "type": "formatted_text",
                                "text": "Second",
                                "format": "plain_text"
                            }
                        ]
                    }),
                },
            ],
            TaintLevel::Clean,
            None,
        )
        .await
        .expect("present_message should capture the last rich payload");

        assert_eq!(rich_content.fallback_text, "Second");
        assert_eq!(messages.len(), 2);
        assert!(messages.iter().all(|message| message.role == Role::Tool));
    }
}

async fn append_tool_outputs(
    messages: &mut Vec<Message>,
    registry: Arc<ToolRegistry>,
    calls: Vec<ToolCall>,
    base_taint: TaintLevel,
    event_tx: Option<&mpsc::Sender<StreamingEvent>>,
) -> Option<RichContent> {
    let futures = calls.into_iter().map(|call| {
        let registry = registry.clone();
        let base_taint = base_taint.clone();
        let event_tx = event_tx.cloned();
        async move {
            if call.name.is_empty() {
                tracing::warn!(
                    id = %call.id,
                    args = %serde_json::to_string(&call.arguments).unwrap_or_default(),
                    "skipping tool call with empty name — likely a malformed provider response"
                );
                return (call, "tool call skipped: empty tool name".to_owned(), true);
            }

            tracing::info!(
                tool = %call.name,
                args = %serde_json::to_string(&call.arguments).unwrap_or_default(),
                "tool call started"
            );
            if let Some(event_tx) = event_tx.as_ref() {
                let _ = event_tx
                    .send(StreamingEvent::ToolStart {
                        tool_name: call.name.clone(),
                        args: call.arguments.clone(),
                    })
                    .await;
            }

            // Scan tool arguments for injected content that may have been smuggled
            // through tool outputs or adversarially crafted user input.
            let args_str = serde_json::to_string(&call.arguments).unwrap_or_default();
            let scan = scan_prompt_injection(&args_str);
            let effective_taint = base_taint.max(scan.taint);

            if effective_taint >= TaintLevel::Malicious {
                tracing::warn!(
                    tool = %call.name,
                    score = scan.score,
                    "blocking tool execution: malicious taint level in arguments"
                );
                let result = (
                    call,
                    "tool execution blocked: high-confidence prompt injection detected in arguments"
                        .to_owned(),
                    true,
                );
                if let Some(event_tx) = event_tx.as_ref() {
                    let _ = event_tx
                        .send(StreamingEvent::ToolEnd {
                            tool_name: result.0.name.clone(),
                            result: result.1.clone(),
                            is_error: result.2,
                        })
                        .await;
                }
                return result;
            }

            if effective_taint >= TaintLevel::Suspicious {
                tracing::warn!(
                    tool = %call.name,
                    score = scan.score,
                    "suspicious taint in tool arguments; executing with caution"
                );
            }

            if let Some(tool) = registry.get(&call.name) {
                let result = match tool.execute(call.arguments.clone()).await {
                    Ok(value) => (call, value, false),
                    Err(err) => (call, err.to_string(), true),
                };
                tracing::info!(
                    tool = %result.0.name,
                    is_error = result.2,
                    result = %result.1.chars().take(200).collect::<String>(),
                    "tool call finished"
                );
                if let Some(event_tx) = event_tx.as_ref() {
                    let _ = event_tx
                        .send(StreamingEvent::ToolEnd {
                            tool_name: result.0.name.clone(),
                            result: result.1.clone(),
                            is_error: result.2,
                        })
                        .await;
                }
                result
            } else {
                tracing::warn!(tool = %call.name, "tool call failed: tool not found");
                let result = (call, "tool not found".to_owned(), true);
                if let Some(event_tx) = event_tx.as_ref() {
                    let _ = event_tx
                        .send(StreamingEvent::ToolEnd {
                            tool_name: result.0.name.clone(),
                            result: result.1.clone(),
                            is_error: result.2,
                        })
                        .await;
                }
                result
            }
        }
    });

    let mut presented_content = None;
    for (call, output, is_error) in join_all(futures).await {
        if !is_error && call.name == "present_message" {
            if let Ok(rich_content) = RichContent::from_tool_value(&call.arguments) {
                presented_content = Some(rich_content);
            }
        }
        let payload = if is_error {
            format!("[tool_error:{}] {output}", call.name)
        } else {
            output
        };
        messages.push(Message {
            id: call.id.clone(),
            role: Role::Tool,
            content: payload,
            tool_calls: None,
            rich_content: None,
            created_at: Utc::now(),
        });
    }

    presented_content
}
