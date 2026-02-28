//! OpenAI Codex OAuth 2.0 Authorization Code + PKCE login flow.
//!
//! OAuth constants extracted from @mariozechner/pi-ai openai-codex.js:
//!   CLIENT_ID     = "app_EMoamEEZ73f0CkXaXp7hrann"
//!   AUTHORIZE_URL = https://auth.openai.com/oauth/authorize
//!   TOKEN_URL     = https://auth.openai.com/oauth/token
//!   REDIRECT_URI  = http://localhost:1455/auth/callback
//!   SCOPE         = "openid profile email offline_access"
//!
//! Sub-modules:
//!   `codex_login_pkce`     — PKCE generation helpers
//!   `codex_login_callback` — local HTTP callback server
//!   `codex_login_token`    — token-exchange logic and `OAuthTokens` type

mod codex_login_pkce;
mod codex_login_callback;
mod codex_login_token;

use std::collections::HashMap;

use reqwest::Client;

use rushdino_common::{AppError, Result};

use codex_login_callback::run_local_callback_server;
use codex_login_pkce::{generate_pkce, random_state};
use codex_login_token::exchange_code;
pub use codex_login_token::OAuthTokens;

const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL: &str = "https://auth.openai.com/oauth/authorize";
const REDIRECT_URI: &str = "http://localhost:1455/auth/callback";
const SCOPE: &str = "openid profile email offline_access";

// ── Redirect-input parsing ────────────────────────────────────────────────────

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

// ── Environment detection ─────────────────────────────────────────────────────

/// Returns `true` when running in a remote/headless environment (SSH, no display).
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

// ── Authorization URL builder ─────────────────────────────────────────────────

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

// ── Entry point ───────────────────────────────────────────────────────────────

/// Run the full Codex OAuth login flow. Returns tokens on success.
///
/// In remote/SSH environments the user is asked to paste the redirect URL or
/// bare code; the OAuth `state` is verified when present to prevent CSRF.
/// In local environments a browser is opened and a local callback server
/// captures the code automatically.
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
        // Verify state when present to prevent CSRF / code-injection attacks.
        let parsed = parse_redirect_input(&input);
        if let Some(ref parsed_state) = parsed.state {
            if parsed_state != &state {
                return Err(AppError::Provider(
                    "OAuth state mismatch — possible CSRF attack. Please restart the login.".into(),
                ));
            }
        }
        parsed.code
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

// ── Tests ─────────────────────────────────────────────────────────────────────

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
