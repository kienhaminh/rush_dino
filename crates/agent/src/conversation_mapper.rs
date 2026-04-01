use chrono::{DateTime, Utc};
use sqlx::Row;

use rushdino_common::{
    models::{Conversation, Message, Role, ToolCall},
    AppError, Result,
};

pub fn map_conversation(row: sqlx::sqlite::SqliteRow) -> Result<Conversation> {
    let created_at = row.try_get::<String, _>("created_at")?;
    let updated_at = row.try_get::<String, _>("updated_at")?;

    Ok(Conversation {
        id: row.try_get("id")?,
        title: row.try_get("title")?,
        created_at: parse_ts(&created_at)?,
        updated_at: parse_ts(&updated_at)?,
    })
}

pub fn map_message(row: sqlx::sqlite::SqliteRow) -> Result<Message> {
    let role = row.try_get::<String, _>("role")?;
    let tool_calls_raw: Option<String> = row.try_get("tool_calls")?;
    let tool_calls = tool_calls_raw
        .as_deref()
        .map(serde_json::from_str::<Vec<ToolCall>>)
        .transpose()
        .map_err(|e| AppError::Validation(format!("invalid stored tool_calls: {e}")))?;
    let rich_content_raw: Option<String> = row.try_get("rich_content")?;
    let rich_content = rich_content_raw
        .as_deref()
        .map(serde_json::from_str)
        .transpose()
        .map_err(|e| AppError::Validation(format!("invalid stored rich_content: {e}")))?;

    let thinking: Option<String> = row.try_get("thinking").unwrap_or(None);

    Ok(Message {
        id: row.try_get("id")?,
        role: parse_role(&role),
        content: row.try_get("content")?,
        tool_calls,
        rich_content,
        thinking,
        created_at: parse_ts(&row.try_get::<String, _>("created_at")?)?,
    })
}

pub fn parse_ts(value: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| AppError::Validation(format!("invalid timestamp {value}: {e}")))
}

pub fn role_to_str(role: &Role) -> &'static str {
    match role {
        Role::System => "system",
        Role::User => "user",
        Role::Assistant => "assistant",
        Role::Tool => "tool",
    }
}

pub fn parse_role(value: &str) -> Role {
    match value {
        "system" => Role::System,
        "assistant" => Role::Assistant,
        "tool" => Role::Tool,
        _ => Role::User,
    }
}
