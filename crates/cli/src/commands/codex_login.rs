//! OpenAI Codex OAuth 2.0 Authorization Code + PKCE login flow.
//!
//! OAuth constants extracted from @mariozechner/pi-ai openai-codex.js:
//!   CLIENT_ID     = "app_EMoamEEZ73f0CkXaXp7hrann"
//!   AUTHORIZE_URL = https://auth.openai.com/oauth/authorize
//!   TOKEN_URL     = https://auth.openai.com/oauth/token
//!   REDIRECT_URI  = http://localhost:1455/auth/callback
//!   SCOPE         = "openid profile email offline_access"

use std::collections::HashMap;
use std::future::IntoFuture;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use axum::{extract::Query, routing::get, Router};
use reqwest::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::net::TcpListener;

use rushdino_common::{AppError, Result};

const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL: &str = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const REDIRECT_URI: &str = "http://localhost:1455/auth/callback";
const SCOPE: &str = "openid profile email offline_access";

const SUCCESS_HTML: &str = r#"<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Authentication successful</title></head>
<body><p>Authentication successful. Return to your terminal.</p></body>
</html>"#;

/// Parsed result from a redirect URL or pasted input.
pub struct RedirectInput {
    pub code: Option<String>,
    pub state: Option<String>,
}

/// Parse what the user pastes: full URL, query string, or bare code.
pub fn parse_redirect_input(input: &str) -> RedirectInput {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return RedirectInput { code: None, state: None };
    }
    if let Ok(url) = url::Url::parse(trimmed) {
        let code = url.query_pairs().find(|(k, _)| k == "code").map(|(_, v)| v.into_owned());
        let state = url.query_pairs().find(|(k, _)| k == "state").map(|(_, v)| v.into_owned());
        return RedirectInput { code, state };
    }
    if trimmed.contains('=') {
        let pairs: HashMap<_, _> = url::form_urlencoded::parse(trimmed.as_bytes()).collect();
        return RedirectInput {
            code: pairs.get("code").map(|v| v.to_string()),
            state: pairs.get("state").map(|v| v.to_string()),
        };
    }
    RedirectInput { code: Some(trimmed.to_owned()), state: None }
}

/// Returns true when running in a remote/headless environment (SSH, no display).
pub fn is_remote() -> bool {
    if std::env::var("SSH_TTY").is_ok() || std::env::var("SSH_CONNECTION").is_ok() {
        return true;
    }
    #[cfg(target_os = "linux")]
    if std::env::var("DISPLAY").is_err() && std::env::var("WAYLAND_DISPLAY").is_err() {
        return true;
    }
    false
}

/// Generate PKCE (verifier, challenge) pair using SHA-256 / base64url.
fn generate_pkce() -> (String, String) {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    let verifier_bytes: Vec<u8> = (0..32).map(|_| rand::random::<u8>()).collect();
    let verifier = URL_SAFE_NO_PAD.encode(&verifier_bytes);
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize().as_slice());
    (verifier, challenge)
}

fn random_state() -> String {
    let bytes: Vec<u8> = (0..16).map(|_| rand::random::<u8>()).collect();
    hex::encode(bytes)
}

/// Build the OpenAI authorization URL with PKCE and Codex-specific extra params.
pub fn build_authorize_url(challenge: &str, state: &str) -> String {
    let mut url = url::Url::parse(AUTHORIZE_URL).expect("static URL is valid");
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", CLIENT_ID)
        .append_pair("redirect_uri", REDIRECT_URI)
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state)
        .append_pair("id_token_add_organizations", "true")
        .append_pair("codex_cli_simplified_flow", "true")
        .append_pair("originator", "pi");
    url.to_string()
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

/// Tokens returned after a successful OAuth exchange.
pub struct OAuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    /// Unix timestamp (seconds) when access_token expires.
    pub expires_at: i64,
}

async fn exchange_code(client: &Client, code: &str, verifier: &str) -> Result<OAuthTokens> {
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
        let body = res.text().await.unwrap_or_default();
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

/// Start a local HTTP server on :1455, wait for the OAuth callback, return the auth code.
async fn run_local_callback_server(expected_state: &str) -> Result<String> {
    let code_cell: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let code_cell_clone = code_cell.clone();
    let expected = expected_state.to_owned();

    let app = Router::new().route(
        "/auth/callback",
        get(move |Query(params): Query<HashMap<String, String>>| {
            let cell = code_cell_clone.clone();
            let exp = expected.clone();
            async move {
                let state_ok = params.get("state").map(|s| s == &exp).unwrap_or(false);
                if let Some(code) = params.get("code").filter(|_| state_ok) {
                    *cell.lock().unwrap() = Some(code.clone());
                }
                axum::response::Html(SUCCESS_HTML)
            }
        }),
    );

    let listener = TcpListener::bind("127.0.0.1:1455")
        .await
        .map_err(|e| AppError::Provider(format!("cannot bind :1455: {e}")))?;

    let server = axum::serve(listener, app);
    let handle = tokio::spawn(server.into_future());

    // Poll for up to 5 minutes (600 x 500 ms)
    for _ in 0..600 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if let Some(code) = code_cell.lock().unwrap().clone() {
            handle.abort();
            return Ok(code);
        }
    }
    handle.abort();
    Err(AppError::Provider("OAuth callback timed out after 5 minutes".into()))
}

/// Run the full Codex OAuth login flow. Returns tokens on success.
pub async fn run() -> Result<OAuthTokens> {
    let (verifier, challenge) = generate_pkce();
    let state = random_state();
    let auth_url = build_authorize_url(&challenge, &state);
    let client = Client::new();

    let code = if is_remote() {
        println!("\nOpen this URL in your LOCAL browser:\n\n{auth_url}\n");
        print!("Paste the redirect URL (or just the code): ");
        std::io::Write::flush(&mut std::io::stdout()).ok();
        let mut input = String::new();
        std::io::stdin()
            .read_line(&mut input)
            .map_err(|e| AppError::Provider(format!("stdin error: {e}")))?;
        parse_redirect_input(&input)
            .code
            .ok_or_else(|| AppError::Provider("No authorization code found in pasted input".into()))?
    } else {
        println!("Opening browser for OpenAI Codex OAuth...");
        println!("If the browser doesn't open, visit:\n{auth_url}");
        if let Err(e) = open::that(&auth_url) {
            tracing::warn!("failed to open browser: {e}");
        }
        println!("Waiting for OAuth callback on http://localhost:1455/auth/callback ...");
        run_local_callback_server(&state).await?
    };

    println!("Exchanging code for tokens...");
    exchange_code(&client, &code, &verifier).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_redirect_url_full() {
        let input = "http://localhost:1455/auth/callback?code=abc123&state=xyz";
        let result = parse_redirect_input(input);
        assert_eq!(result.code.as_deref(), Some("abc123"));
        assert_eq!(result.state.as_deref(), Some("xyz"));
    }

    #[test]
    fn test_parse_redirect_url_code_only() {
        let input = "abc123";
        let result = parse_redirect_input(input);
        assert_eq!(result.code.as_deref(), Some("abc123"));
        assert!(result.state.is_none());
    }

    #[test]
    fn test_parse_redirect_url_query_string() {
        let input = "code=abc123&state=xyz";
        let result = parse_redirect_input(input);
        assert_eq!(result.code.as_deref(), Some("abc123"));
        assert_eq!(result.state.as_deref(), Some("xyz"));
    }

    #[test]
    fn test_build_authorize_url_contains_required_params() {
        let url = build_authorize_url("challenge_abc", "state_xyz");
        assert!(url.contains("client_id=app_EMoamEEZ73f0CkXaXp7hrann"));
        assert!(url.contains("code_challenge=challenge_abc"));
        assert!(url.contains("state=state_xyz"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("codex_cli_simplified_flow=true"));
        assert!(url.contains("offline_access"));
    }
}
