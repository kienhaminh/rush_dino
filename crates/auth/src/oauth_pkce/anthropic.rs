use reqwest::Client;
use serde::Deserialize;
use std::time::{SystemTime, UNIX_EPOCH};

use rushdino_common::{AppError, Result};

use super::pkce::generate_pkce;
use super::token::OAuthTokens;
use super::PendingOAuthLogin;

const CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL: &str = "https://claude.ai/oauth/authorize";
const TOKEN_URL: &str = "https://console.anthropic.com/v1/oauth/token";
const REDIRECT_URI: &str = "https://console.anthropic.com/oauth/code/callback";
const SCOPE: &str = "org:create_api_key user:profile user:inference";

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

fn build_auth_url(challenge: &str, verifier: &str) -> String {
    let mut url = url::Url::parse(AUTHORIZE_URL).expect("static URL is valid");
    url.query_pairs_mut()
        .append_pair("code", "true")
        .append_pair("client_id", CLIENT_ID)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", REDIRECT_URI)
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", verifier); // state == verifier for Anthropic
    url.to_string()
}

pub fn start_anthropic_login() -> PendingOAuthLogin {
    let (verifier, challenge) = generate_pkce();
    let auth_url = build_auth_url(&challenge, &verifier);
    PendingOAuthLogin {
        state: verifier.clone(), // state == verifier for Anthropic
        verifier,
        auth_url,
    }
}

pub fn extract_anthropic_code(input: &str, verifier: &str) -> Result<String> {
    let trimmed = input.trim();
    if let Some((code, state)) = trimmed.split_once('#') {
        if state != verifier {
            return Err(AppError::Provider(
                "OAuth state mismatch — possible CSRF attack. Please restart the login.".into(),
            ));
        }
        return Ok(code.to_owned());
    }
    if trimmed.is_empty() {
        return Err(AppError::Provider("No authorization code provided.".into()));
    }
    Ok(trimmed.to_owned())
}

pub async fn complete_anthropic_login(
    client: &Client,
    code: &str,
    verifier: &str,
) -> Result<OAuthTokens> {
    let body = serde_json::json!({
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "code": code,
        "state": verifier,
        "redirect_uri": REDIRECT_URI,
        "code_verifier": verifier,
    });

    let res = client
        .post(TOKEN_URL)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Provider(format!("Anthropic token request failed: {e}")))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res
            .text()
            .await
            .unwrap_or_else(|e| format!("<failed to read body: {e}>"));
        return Err(AppError::Provider(format!(
            "Anthropic token exchange failed ({status}): {text}"
        )));
    }

    let token: TokenResponse = res
        .json()
        .await
        .map_err(|e| AppError::Provider(format!("Anthropic token parse error: {e}")))?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    Ok(OAuthTokens {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: now + token.expires_in as i64,
    })
}

pub async fn refresh_anthropic_token(
    client: &Client,
    refresh_token: &str,
) -> Result<OAuthTokens> {
    let body = serde_json::json!({
        "grant_type": "refresh_token",
        "client_id": CLIENT_ID,
        "refresh_token": refresh_token,
    });

    let res = client
        .post(TOKEN_URL)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Provider(format!("Anthropic token refresh failed: {e}")))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res
            .text()
            .await
            .unwrap_or_else(|e| format!("<failed to read body: {e}>"));
        return Err(AppError::Provider(format!(
            "Anthropic token refresh failed ({status}): {text}"
        )));
    }

    let token: TokenResponse = res
        .json()
        .await
        .map_err(|e| AppError::Provider(format!("Anthropic token refresh parse error: {e}")))?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    Ok(OAuthTokens {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: now + token.expires_in as i64,
    })
}

#[cfg(test)]
mod tests {
    use super::{extract_anthropic_code, start_anthropic_login};

    #[test]
    fn start_anthropic_login_sets_state_to_verifier() {
        let login = start_anthropic_login();
        assert_eq!(login.state, login.verifier);
        assert!(login.auth_url.contains("https://claude.ai/oauth/authorize"));
        assert!(login.auth_url.contains("code_challenge="));
        assert!(login.auth_url.contains(&format!("state={}", login.verifier)));
    }

    #[test]
    fn extract_anthropic_code_accepts_code_hash_state() {
        let code = extract_anthropic_code("abc123#my-verifier", "my-verifier")
            .expect("valid input should parse");
        assert_eq!(code, "abc123");
    }

    #[test]
    fn extract_anthropic_code_rejects_state_mismatch() {
        let error = extract_anthropic_code("abc123#wrong-state", "my-verifier")
            .expect_err("state mismatch should fail");
        assert!(error.to_string().contains("state mismatch"));
    }

    #[test]
    fn extract_anthropic_code_accepts_bare_code() {
        let code = extract_anthropic_code("abc123", "my-verifier")
            .expect("bare code should be accepted");
        assert_eq!(code, "abc123");
    }

    #[test]
    fn extract_anthropic_code_rejects_empty_input() {
        let error = extract_anthropic_code("   ", "my-verifier")
            .expect_err("empty input should fail");
        assert!(error.to_string().contains("No authorization code"));
    }
}
