//! Conversation history compaction.
//!
//! When the running `messages` vector approaches `max_context_tokens`, `compact_messages`
//! replaces the oldest groups with a single LLM-generated summary exchange, preserving
//! key facts without consuming the full token budget.

use chrono::Utc;
use uuid::Uuid;

use rushdino_common::{
    models::{Message, Role},
    Result,
};
use rushdino_providers::{
    types::{ChatRequest, ThinkingLevel},
    Provider,
};

use crate::context::estimate_tokens;

/// Trigger compaction when total estimated tokens exceed this fraction of `max_tokens`.
const COMPACT_THRESHOLD: f64 = 0.75;
/// Keep the most-recent groups that together fit within this fraction of `max_tokens` verbatim.
const KEEP_RECENT_BUDGET: f64 = 0.40;
/// Maximum output tokens for the compaction LLM call.
const SUMMARY_MAX_TOKENS: u32 = 2048;

/// Returns `true` when total estimated tokens exceed `COMPACT_THRESHOLD * max_tokens`.
pub fn needs_compaction(messages: &[Message], max_tokens: usize) -> bool {
    let total: usize = messages.iter().map(|m| estimate_tokens(&m.content)).sum();
    (total as f64) > (max_tokens as f64 * COMPACT_THRESHOLD)
}

/// Returns (start_inclusive, end_exclusive) index pairs for each atomic group.
/// An assistant message with tool_calls is grouped with all following Tool messages.
fn group_indices(messages: &[Message]) -> Vec<(usize, usize)> {
    let mut groups = Vec::new();
    let mut i = 0;
    while i < messages.len() {
        if messages[i].role == Role::Assistant
            && messages[i]
                .tool_calls
                .as_ref()
                .is_some_and(|tc| !tc.is_empty())
        {
            let start = i;
            i += 1;
            while i < messages.len() && messages[i].role == Role::Tool {
                i += 1;
            }
            groups.push((start, i));
        } else {
            groups.push((i, i + 1));
            i += 1;
        }
    }
    groups
}

/// Compact the oldest message groups into a summary exchange.
///
/// - The system prompt group (index 0) is always kept verbatim.
/// - The most-recent groups that fit within `KEEP_RECENT_BUDGET * max_tokens` are kept verbatim.
/// - Groups in between are summarised into a synthetic `[User] Compacted history` /
///   `[Assistant] Understood` exchange.
/// - Returns `messages` unchanged if there is nothing to compact or the LLM call fails.
pub async fn compact_messages(
    provider: &Provider,
    messages: Vec<Message>,
    max_tokens: usize,
) -> Vec<Message> {
    let groups = group_indices(&messages);

    if groups.len() <= 2 {
        return messages; // system + at most one other group — nothing to compact
    }

    let keep_budget = (max_tokens as f64 * KEEP_RECENT_BUDGET) as usize;
    let mut used = 0usize;
    let mut keep_count = 0usize;

    for &(start, end) in groups[1..].iter().rev() {
        let cost: usize = messages[start..end]
            .iter()
            .map(|m| estimate_tokens(&m.content))
            .sum();
        if used + cost > keep_budget {
            break;
        }
        used += cost;
        keep_count += 1;
    }

    let compact_end_group = groups.len().saturating_sub(keep_count);
    if compact_end_group <= 1 {
        return messages; // Everything fits in the keep budget
    }

    let sys_end = groups[0].1;
    let compact_start = groups[1].0;
    let keep_start = groups[compact_end_group].0;

    let to_compact = &messages[compact_start..keep_start];
    if to_compact.is_empty() {
        return messages;
    }

    let summary = match summarize_history(provider, to_compact).await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!(error = %e, "compaction LLM call failed — keeping original messages");
            return messages;
        }
    };

    tracing::info!(
        compacted = to_compact.len(),
        kept_recent = keep_count,
        "conversation history compacted"
    );

    let mut result = messages[..sys_end].to_vec();
    result.push(Message {
        id: Uuid::new_v4().to_string(),
        role: Role::User,
        content: format!("[Conversation history — compacted]\n\n{summary}"),
        tool_calls: None,
        rich_content: None,
        thinking: None,
        created_at: Utc::now(),
    });
    result.push(Message {
        id: Uuid::new_v4().to_string(),
        role: Role::Assistant,
        content: "Understood, I have the context from the earlier part of this conversation."
            .to_owned(),
        tool_calls: None,
        rich_content: None,
        thinking: None,
        created_at: Utc::now(),
    });
    result.extend_from_slice(&messages[keep_start..]);
    result
}

async fn summarize_history(provider: &Provider, messages: &[Message]) -> Result<String> {
    let mut history = String::new();
    for msg in messages {
        let label = match msg.role {
            Role::System => continue,
            Role::User => "User",
            Role::Assistant => "Assistant",
            Role::Tool => "Tool result",
        };
        let snippet = if msg.content.len() > 2_000 {
            format!("{}…(truncated)", &msg.content[..2_000])
        } else {
            msg.content.clone()
        };
        history.push_str(&format!("[{label}]: {snippet}\n\n"));
    }

    let prompt = format!(
        "Summarize the following conversation history into a compact context note.\n\
         Focus on:\n\
         - What the user asked or requested\n\
         - What tools were called and the key information found\n\
         - Important facts, decisions, or discoveries\n\
         - What has been completed and what remains pending\n\n\
         Be concise. Use bullet points. Preserve specific details that may be needed \
         later (file names, URLs, key facts, exact values).\n\n\
         Conversation history:\n{history}"
    );

    let response = provider
        .chat(ChatRequest {
            messages: vec![Message::new(Uuid::new_v4().to_string(), Role::User, prompt)],
            tools: None,
            temperature: Some(0.1),
            max_tokens: Some(SUMMARY_MAX_TOKENS),
            model: None,
            thinking_level: Some(ThinkingLevel::Off),
        })
        .await?;

    Ok(response.content)
}

#[cfg(test)]
mod tests {
    use rushdino_common::models::{Message, Role};

    use super::{group_indices, needs_compaction};

    fn msg(role: Role, content: &str) -> Message {
        Message::new(uuid::Uuid::new_v4().to_string(), role, content)
    }

    #[test]
    fn no_compaction_when_under_threshold() {
        let messages: Vec<_> = (0..10).map(|_| msg(Role::User, &"a".repeat(100))).collect();
        // 10 * (100/4) = 250 tokens, threshold 75% of 1000 = 750 — not reached
        assert!(!needs_compaction(&messages, 1000));
    }

    #[test]
    fn compaction_needed_when_over_threshold() {
        let messages: Vec<_> = (0..10).map(|_| msg(Role::User, &"a".repeat(400))).collect();
        // 10 * 100 = 1000 tokens, threshold 75% of 1000 = 750 — exceeded
        assert!(needs_compaction(&messages, 1000));
    }

    #[test]
    fn group_indices_singleton_for_plain_messages() {
        let messages = vec![
            msg(Role::System, "sys"),
            msg(Role::User, "hello"),
            msg(Role::Assistant, "hi"),
        ];
        let groups = group_indices(&messages);
        assert_eq!(groups, vec![(0, 1), (1, 2), (2, 3)]);
    }

    #[test]
    fn group_indices_bundles_tool_calls_with_results() {
        use rushdino_common::models::ToolCall;
        let mut assistant_msg = msg(Role::Assistant, "thinking");
        assistant_msg.tool_calls = Some(vec![ToolCall {
            id: "c1".to_owned(),
            name: "read".to_owned(),
            arguments: serde_json::json!({}),
        }]);
        let messages = vec![
            msg(Role::System, "sys"),
            msg(Role::User, "hello"),
            assistant_msg,
            msg(Role::Tool, "file content"),
            msg(Role::User, "thanks"),
        ];
        let groups = group_indices(&messages);
        // System, User, [Assistant+Tool], User
        assert_eq!(groups, vec![(0, 1), (1, 2), (2, 4), (4, 5)]);
    }
}
