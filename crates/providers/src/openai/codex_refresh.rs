use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::Client;
use serde::Deserialize;

use rushdino_common::{AppError, Result};

const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";

#[derive(Debug, Deserialize)]
struct RefreshResponse {
    access_token: String,
    refresh_token: String,
    expires_in: i64,
}

pub async fn refresh_codex_token(refresh_token: &str) -> Result<(String, String, i64)> {
    let params = [
        ("grant_type", "refresh_token"),
        ("client_id", CLIENT_ID),
        ("refresh_token", refresh_token.trim()),
    ];

    let response = Client::new()
        .post(TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| AppError::Provider(format!("codex refresh request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|e| format!("<failed to read body: {e}>"));
        return Err(AppError::Provider(format!(
            "codex refresh failed ({status}): {body}"
        )));
    }

    let token: RefreshResponse = response
        .json()
        .await
        .map_err(|e| AppError::Provider(format!("codex refresh parse error: {e}")))?;
    let now = now_unix();

    Ok((
        token.access_token,
        token.refresh_token,
        now + token.expires_in,
    ))
}

pub fn token_needs_refresh(expires_at: Option<i64>) -> bool {
    let Some(expires_at) = expires_at else {
        return false;
    };
    expires_at - now_unix() <= 300
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::token_needs_refresh;

    #[test]
    fn refresh_check_handles_none() {
        assert!(!token_needs_refresh(None));
    }

    #[test]
    fn refresh_check_handles_far_future() {
        let far_future = 4_102_444_800; // 2100-01-01 UTC
        assert!(!token_needs_refresh(Some(far_future)));
    }
}
