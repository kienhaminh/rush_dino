mod callback;
mod pkce;
mod token;

use std::collections::HashMap;

use reqwest::Client;

use rushdino_common::{AppError, Result};

use callback::run_local_callback_server;
use pkce::{generate_pkce, random_state};
use token::exchange_code;
pub use token::{refresh_access_token, OAuthTokens};

const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL: &str = "https://auth.openai.com/oauth/authorize";
const REDIRECT_URI: &str = "http://localhost:1455/auth/callback";
const SCOPE: &str = "openid profile email offline_access";

pub struct PendingOAuthLogin {
    pub verifier: String,
    pub state: String,
    pub auth_url: String,
}

pub struct RedirectInput {
    pub code: Option<String>,
    pub state: Option<String>,
}

pub fn parse_redirect_input(input: &str) -> RedirectInput {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return RedirectInput {
            code: None,
            state: None,
        };
    }
    if let Ok(url) = url::Url::parse(trimmed) {
        let code = url
            .query_pairs()
            .find(|(k, _)| k == "code")
            .map(|(_, v)| v.into_owned());
        let state = url
            .query_pairs()
            .find(|(k, _)| k == "state")
            .map(|(_, v)| v.into_owned());
        return RedirectInput { code, state };
    }
    if trimmed.contains('=') {
        let pairs: HashMap<_, _> = url::form_urlencoded::parse(trimmed.as_bytes()).collect();
        return RedirectInput {
            code: pairs.get("code").map(|v| v.to_string()),
            state: pairs.get("state").map(|v| v.to_string()),
        };
    }
    RedirectInput {
        code: Some(trimmed.to_owned()),
        state: None,
    }
}

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

pub fn start_login() -> PendingOAuthLogin {
    let (verifier, challenge) = generate_pkce();
    let state = random_state();
    let auth_url = build_authorize_url(&challenge, &state);
    PendingOAuthLogin {
        verifier,
        state,
        auth_url,
    }
}

pub fn extract_authorization_code(input: &str, expected_state: &str) -> Result<String> {
    let parsed = parse_redirect_input(input);
    if let Some(ref parsed_state) = parsed.state {
        if parsed_state != expected_state {
            return Err(AppError::Provider(
                "OAuth state mismatch — possible CSRF attack. Please restart the login.".into(),
            ));
        }
    }
    parsed
        .code
        .ok_or_else(|| AppError::Provider("No authorization code found in pasted input".into()))
}

pub async fn complete_login(client: &Client, code: &str, verifier: &str) -> Result<OAuthTokens> {
    exchange_code(client, code, verifier).await
}

pub async fn run() -> Result<OAuthTokens> {
    let pending = start_login();
    let client = Client::new();

    let code = if is_remote() {
        println!("\nOpen this URL in your LOCAL browser:\n\n{}\n", pending.auth_url);
        print!("Paste the redirect URL (or just the code): ");
        std::io::Write::flush(&mut std::io::stdout()).ok();
        let mut input = String::new();
        std::io::stdin()
            .read_line(&mut input)
            .map_err(|e| AppError::Provider(format!("stdin error: {e}")))?;
        extract_authorization_code(&input, &pending.state)?
    } else {
        println!("Opening browser for OpenAI OAuth...");
        println!("If the browser doesn't open, visit:\n{}", pending.auth_url);
        if let Err(e) = open::that(&pending.auth_url) {
            tracing::warn!("failed to open browser: {e}");
        }
        println!("Waiting for OAuth callback on http://localhost:1455/auth/callback ...");
        run_local_callback_server(&pending.state).await?
    };

    println!("Exchanging code for tokens...");
    complete_login(&client, &code, &pending.verifier).await
}

#[cfg(test)]
mod tests {
    use super::{extract_authorization_code, start_login};

    #[test]
    fn start_login_builds_pending_session() {
        let login = start_login();

        assert!(!login.verifier.is_empty());
        assert!(!login.state.is_empty());
        assert!(login.auth_url.contains("https://auth.openai.com/oauth/authorize"));
        assert!(login.auth_url.contains("code_challenge="));
        assert!(login.auth_url.contains(&format!("state={}", login.state)));
    }

    #[test]
    fn extract_authorization_code_accepts_full_redirect_url() {
        let code = extract_authorization_code(
            "http://localhost:1455/auth/callback?code=abc123&state=expected-state",
            "expected-state",
        )
        .expect("redirect URL should parse");

        assert_eq!(code, "abc123");
    }

    #[test]
    fn extract_authorization_code_rejects_state_mismatch() {
        let error = extract_authorization_code(
            "http://localhost:1455/auth/callback?code=abc123&state=wrong-state",
            "expected-state",
        )
        .expect_err("state mismatch should fail");

        assert!(error.to_string().contains("state mismatch"));
    }
}
