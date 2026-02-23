use std::sync::Arc;

use chrono::Utc;
use futures::future::join_all;
use uuid::Uuid;

use rushdino_common::{models::Message, models::Role, AppError, Result};
use rushdino_providers::{types::ChatRequest, types::ChatResponse, Provider};

use crate::{context::truncate_messages, engine::AgentConfig, tool_registry::ToolRegistry};

pub async fn run_react_loop(
    provider: Arc<Provider>,
    registry: Arc<ToolRegistry>,
    mut messages: Vec<Message>,
    config: &AgentConfig,
) -> Result<(ChatResponse, Vec<Message>)> {
    let mut last = None;

    for _ in 0..config.max_iterations {
        let input = truncate_messages(&messages, config.max_context_tokens);
        let response = provider
            .chat(ChatRequest {
                messages: input,
                tools: Some(registry.definitions()),
                temperature: Some(0.2),
                max_tokens: Some(1200),
                model: None,
            })
            .await?;

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

        let calls = response.tool_calls.clone();
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

        last = Some(response);
    }

    let fallback = last.ok_or_else(|| AppError::Agent("empty ReAct execution".to_owned()))?;
    Ok((fallback, messages))
}
