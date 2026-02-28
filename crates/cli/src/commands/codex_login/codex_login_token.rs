//! OAuth token exchange for Codex login.
//!
//! Sends the authorization code + PKCE verifier to the OpenAI token endpoint
//! and returns the resulting access/refresh tokens.

use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::Client;
use serde::Deserialize;

use rushdino_common::{AppError, Result};

/// OpenAI token endpoint.
const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
/// OAuth client ID for the Codex CLI application.
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
/// Registered redirect URI for the local callback server.
const REDIRECT_URI: &str = "http://localhost:1455/auth/callback";

/// Raw token response shape returned by the OpenAI token endpoint.
#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    /// Lifetime of the access token in seconds.
    expires_in: u64,
}

/// Tokens returned after a successful OAuth authorization-code exchange.
pub struct OAuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    /// Unix timestamp (seconds) at which `access_token` expires.
    pub expires_at: i64,
}

/// Exchange an authorization `code` and PKCE `verifier` for OAuth tokens.
///
/// Posts to `TOKEN_URL` using `application/x-www-form-urlencoded`. On a
/// non-2xx response the full body (or a read-error description) is included
/// in the returned error to aid debugging.
pub async fn exchange_code(client: &Client, code: &str, verifier: &str) -> Result<OAuthTokens> {
    let params = [
        ("grant_type", "authorization_code"),
        ("client_id", CLIENT_ID),
        ("code", code),
        ("code_verifier", verifier),
        ("redirect_uri", REDIRECT_URI),
    ];
    let res = client
        .post(TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| AppError::Provider(format!("token request failed: {e}")))?;

    if !res.status().is_success() {
        let status = res.status();
        // Propagate body-read errors instead of silently swallowing them.
        let body = res.text().await.unwrap_or_else(|e| format!("<failed to read body: {e}>"));
        return Err(AppError::Provider(format!("token exchange failed ({status}): {body}")));
    }

    let token: TokenResponse = res
        .json()
        .await
        .map_err(|e| AppError::Provider(format!("token parse error: {e}")))?;

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
