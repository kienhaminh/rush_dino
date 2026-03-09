use rushdino_common::{AppError, Result};

const TELEGRAM_PARSE_MODE_HTML: &str = "HTML";

pub(crate) fn send_message_draft_url(token: &str) -> String {
    format!("https://api.telegram.org/bot{token}/sendMessageDraft")
}

pub(crate) fn send_message_draft_payload(
    chat_id: i64,
    draft_id: i64,
    text: &str,
) -> serde_json::Value {
    serde_json::json!({
        "chat_id": chat_id,
        "draft_id": draft_id,
        "text": text,
        "parse_mode": TELEGRAM_PARSE_MODE_HTML,
    })
}

pub(crate) async fn send_message_draft(
    client: &reqwest::Client,
    token: &str,
    chat_id: i64,
    draft_id: i64,
    text: &str,
) -> Result<()> {
    let response = client
        .post(send_message_draft_url(token))
        .json(&send_message_draft_payload(chat_id, draft_id, text))
        .send()
        .await
        .map_err(|err| {
            AppError::Agent(format!("telegram sendMessageDraft request failed: {err}"))
        })?;

    let status = response.status();
    let body = response.json::<serde_json::Value>().await.map_err(|err| {
        AppError::Agent(format!(
            "telegram sendMessageDraft response decode failed: {err}"
        ))
    })?;

    if body
        .get("ok")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
    {
        return Ok(());
    }

    let description = body
        .get("description")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("unknown Telegram API error");
    Err(AppError::Agent(format!(
        "telegram sendMessageDraft rejected ({status}): {description}"
    )))
}

pub(crate) fn is_unsupported_send_message_draft_error(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    message.contains("sendmessagedraft")
        && (message.contains("not found")
            || message.contains("unsupported")
            || message.contains("unknown method")
            || message.contains("method is unavailable")
            || message.contains("can't use")
            || message.contains("can not use"))
}

#[cfg(test)]
mod tests {
    use super::{
        is_unsupported_send_message_draft_error, send_message_draft_payload, send_message_draft_url,
    };

    #[test]
    fn builds_send_message_draft_request() {
        assert_eq!(
            send_message_draft_url("123:abc"),
            "https://api.telegram.org/bot123:abc/sendMessageDraft"
        );
        assert_eq!(
            send_message_draft_payload(42, 7, "<b>hello</b>"),
            serde_json::json!({
                "chat_id": 42,
                "draft_id": 7,
                "text": "<b>hello</b>",
                "parse_mode": "HTML",
            })
        );
    }

    #[test]
    fn detects_unsupported_send_message_draft_errors() {
        assert!(is_unsupported_send_message_draft_error(
            "telegram sendMessageDraft rejected (404 Not Found): Not Found"
        ));
        assert!(is_unsupported_send_message_draft_error(
            "telegram sendMessageDraft rejected (400 Bad Request): method is unavailable for this bot"
        ));
        assert!(!is_unsupported_send_message_draft_error(
            "telegram sendMessageDraft request failed: timeout"
        ));
    }
}
