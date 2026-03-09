use rushdino_common::models::Message;

pub fn estimate_tokens(text: &str) -> usize {
    (text.chars().count() / 4).max(1)
}

pub fn truncate_messages(messages: &[Message], max_tokens: usize) -> Vec<Message> {
    if messages.is_empty() {
        return Vec::new();
    }

    let mut keep = Vec::new();
    let mut used = 0_usize;

    if let Some(system) = messages.first().cloned() {
        used += estimate_tokens(&system.content);
        keep.push(system);
    }

    for message in messages.iter().rev() {
        if keep.first().map(|m| m.id.as_str()) == Some(message.id.as_str()) {
            continue;
        }
        let cost = estimate_tokens(&message.content);
        if used + cost > max_tokens {
            break;
        }
        used += cost;
        keep.push(message.clone());
    }

    keep.reverse();
    keep
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use rushdino_common::models::{Message, Role};

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
}
