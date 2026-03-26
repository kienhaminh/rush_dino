use rushdino_common::models::{Message, Role};

pub fn estimate_tokens(text: &str) -> usize {
    (text.chars().count() / 4).max(1)
}

/// Group messages into atomic blocks that must be kept or dropped together.
///
/// An assistant message that contains `tool_calls` is grouped with all
/// immediately following `Tool` messages. Dropping only one side would
/// produce an invalid conversation for OpenAI-compatible providers.
fn build_groups(messages: &[Message]) -> Vec<Vec<&Message>> {
    let mut groups: Vec<Vec<&Message>> = Vec::new();
    let mut i = 0;
    while i < messages.len() {
        let msg = &messages[i];
        if msg.role == Role::Assistant && msg.tool_calls.as_ref().is_some_and(|tc| !tc.is_empty()) {
            let mut group = vec![msg];
            i += 1;
            while i < messages.len() && messages[i].role == Role::Tool {
                group.push(&messages[i]);
                i += 1;
            }
            groups.push(group);
        } else {
            groups.push(vec![msg]);
            i += 1;
        }
    }
    groups
}

pub fn truncate_messages(messages: &[Message], max_tokens: usize) -> Vec<Message> {
    if messages.is_empty() {
        return Vec::new();
    }

    let groups = build_groups(messages);

    let mut keep: Vec<Vec<Message>> = Vec::new();
    let mut used = 0_usize;

    // Always keep the first group (system prompt).
    if let Some(first) = groups.first() {
        let cost: usize = first.iter().map(|m| estimate_tokens(&m.content)).sum();
        used += cost;
        keep.push(first.iter().map(|m| (*m).clone()).collect());
    }

    // Always keep the last group (most recent user/assistant message) to ensure
    // providers receive at least one non-system input message.
    if groups.len() > 1 {
        let last = groups.last().unwrap();
        let cost: usize = last.iter().map(|m| estimate_tokens(&m.content)).sum();
        used += cost;
        keep.push(last.iter().map(|m| (*m).clone()).collect());
    }

    // Walk remaining groups from most-recent to oldest, keeping whole groups.
    for group in groups.iter().rev() {
        // Skip the first group (already kept) and last group (already kept).
        if std::ptr::eq(group.as_ptr(), groups[0].as_ptr()) {
            continue;
        }
        if std::ptr::eq(group.as_ptr(), groups.last().unwrap().as_ptr()) {
            continue;
        }
        let cost: usize = group.iter().map(|m| estimate_tokens(&m.content)).sum();
        if used + cost > max_tokens {
            break;
        }
        used += cost;
        keep.push(group.iter().map(|m| (*m).clone()).collect());
    }

    keep.reverse();
    keep.into_iter().flatten().collect()
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use rushdino_common::models::{Message, Role, ToolCall};

    use super::truncate_messages;

    fn msg(id: &str, role: Role, content: &str) -> Message {
        Message {
            id: id.to_owned(),
            role,
            content: content.to_owned(),
            tool_calls: None,
            rich_content: None,
            created_at: Utc::now(),
        }
    }

    fn assistant_with_tool_calls(id: &str, content: &str) -> Message {
        Message {
            id: id.to_owned(),
            role: Role::Assistant,
            content: content.to_owned(),
            tool_calls: Some(vec![ToolCall {
                id: format!("call_{id}"),
                name: "test_tool".to_owned(),
                arguments: serde_json::json!({}),
            }]),
            rich_content: None,
            created_at: Utc::now(),
        }
    }

    #[test]
    fn keeps_recent_messages() {
        let messages = vec![
            msg("1", Role::System, "sys"),
            msg("2", Role::User, "short"),
            msg("3", Role::Assistant, &"x".repeat(500)),
            msg("4", Role::User, "latest"),
        ];
        let out = truncate_messages(&messages, 30);
        assert!(out.iter().any(|m| m.id == "1"));
        assert!(out.iter().any(|m| m.id == "4"));
    }

    #[test]
    fn tool_call_and_results_kept_together() {
        let messages = vec![
            msg("1", Role::System, "sys"),
            msg("2", Role::User, "hello"),
            assistant_with_tool_calls("3", "thinking"),
            msg("call_3", Role::Tool, "tool result"),
            msg("5", Role::User, "latest"),
        ];
        let out = truncate_messages(&messages, 1000);
        // Both assistant and tool result must be present
        assert!(out.iter().any(|m| m.id == "3"));
        assert!(out.iter().any(|m| m.id == "call_3"));
    }

    #[test]
    fn tool_call_group_dropped_as_unit() {
        // Budget is too small to keep the tool group + user message, so the
        // tool group is dropped entirely — never leaving orphan tool results.
        let messages = vec![
            msg("1", Role::System, "sys"),
            assistant_with_tool_calls("2", &"x".repeat(400)),
            msg("call_2", Role::Tool, &"y".repeat(400)),
            msg("4", Role::User, "latest"),
        ];
        let out = truncate_messages(&messages, 30);
        let has_assistant = out.iter().any(|m| m.id == "2");
        let has_tool = out.iter().any(|m| m.id == "call_2");
        // Either both present or both absent
        assert_eq!(has_assistant, has_tool, "tool group must be atomic");
        // System + latest user kept
        assert!(out.iter().any(|m| m.id == "1"));
        assert!(out.iter().any(|m| m.id == "4"));
    }
}
