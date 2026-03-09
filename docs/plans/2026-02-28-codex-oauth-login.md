# Codex OAuth Login Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add OpenAI Codex OAuth 2.0 login to `rushdino init`, storing tokens in `credentials.toml` and wiring up a Codex provider for inference.

**Architecture:** OAuth 2.0 Authorization Code + PKCE flow against OpenAI's auth server. A local HTTP server on port 1455 catches the callback automatically when running locally; on remote/headless machines, the user pastes the redirect URL manually. Tokens are stored flat in `credentials.toml`. The Codex provider reuses `OpenAIProvider` with the OAuth `access_token` as a Bearer key.

**Tech Stack:** Rust, `oauth2 = "4"` crate, `open = "5"` crate, `reqwest` (already in workspace), `tokio` (already in workspace), `axum` (already in workspace for local callback server), `dialoguer` (already in CLI)

---

## OAuth Constants (extracted from `@mariozechner/pi-ai` source)

```
CLIENT_ID    = "app_EMoamEEZ73f0CkXaXp7hrann"
AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize"
TOKEN_URL     = "https://auth.openai.com/oauth/token"
REDIRECT_URI  = "http://localhost:1455/auth/callback"
SCOPE         = "openid profile email offline_access"
Extra params  = id_token_add_organizations=true, codex_cli_simplified_flow=true, originator=pi
```

---

## Task 1: Add cargo dependencies

**Files:**
- Modify: `Cargo.toml` (workspace root)
- Modify: `crates/cli/Cargo.toml`

**Step 1: Add workspace deps**

In `Cargo.toml`, inside `[workspace.dependencies]`, add:

```toml
oauth2 = "4"
open = "5"
```

**Step 2: Add to CLI crate**

In `crates/cli/Cargo.toml`, inside `[dependencies]`, add:

```toml
oauth2.workspace = true
open.workspace = true
```

**Step 3: Verify it compiles**

```bash
cargo check -p rushdino-cli
```

Expected: no errors (new deps just need to resolve).

**Step 4: Commit**

```bash
git add Cargo.toml crates/cli/Cargo.toml Cargo.lock
git commit -m "chore: add oauth2 and open deps for Codex login"
```

---

## Task 2: Extend config types for Codex

**Files:**
- Modify: `crates/common/src/config.rs`

**Step 1: Add `Codex` variant to `ProviderKind`**

Find the enum (line 11) and add the variant:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderKind {
    Ollama,
    Openai,
    Anthropic,
    Codex,   // ← add this
    Plugin,
}
```

**Step 2: Add Codex model config to `AppConfig`**

Add a field after `anthropic`:

```rust
pub codex: ProviderModelConfig,
```

And in `Default for AppConfig`, add:

```rust
codex: ProviderModelConfig {
    model: "gpt-4.1-mini".to_owned(),
},
```

**Step 3: Add token fields to `CredentialsConfig`**

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CredentialsConfig {
    pub openai_api_key: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub brave_api_key: Option<String>,
    pub telegram_bot_token: Option<String>,
    pub discord_bot_token: Option<String>,
    pub slack_bot_token: Option<String>,
    pub slack_app_token: Option<String>,
    // Codex OAuth tokens
    pub codex_access_token: Option<String>,
    pub codex_refresh_token: Option<String>,
    /// Unix timestamp seconds when access_token expires
    pub codex_token_expires_at: Option<i64>,
}
```

**Step 4: Verify**

```bash
cargo check --workspace
```

Expected: compile error in `crates/server/src/lib.rs` about non-exhaustive match on `ProviderKind` — that's expected, we fix it in Task 5.

**Step 5: Commit**

```bash
git add crates/common/src/config.rs
git commit -m "feat(config): add Codex provider kind and OAuth token fields"
```

---

## Task 3: Create `codex_login.rs` — OAuth flow

**Files:**
- Create: `crates/cli/src/commands/codex_login.rs`
- Modify: `crates/cli/src/commands/mod.rs` (add `pub mod codex_login;`)

**Step 1: Write tests first**

Create `crates/cli/src/commands/codex_login.rs` with tests at the bottom:

```rust
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
        // User pastes just the code
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
    fn test_is_remote_ssh_tty() {
        // Simulate SSH environment
        std::env::set_var("SSH_TTY", "/dev/pts/0");
        assert!(is_remote());
        std::env::remove_var("SSH_TTY");
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
```

**Step 2: Run tests to see them fail**

```bash
cargo test -p rushdino-cli codex_login 2>&1 | head -20
```

Expected: compile error — module doesn't exist yet.

**Step 3: Implement the module**

Write the full implementation in `crates/cli/src/commands/codex_login.rs`:

```rust
//! OpenAI Codex OAuth 2.0 Authorization Code + PKCE login flow.
//!
//! OAuth constants match @mariozechner/pi-ai openai-codex.js:
//!   CLIENT_ID    = "app_EMoamEEZ73f0CkXaXp7hrann"
//!   AUTHORIZE_URL = https://auth.openai.com/oauth/authorize
//!   TOKEN_URL     = https://auth.openai.com/oauth/token
//!   REDIRECT_URI  = http://localhost:1455/auth/callback

use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::Client;
use serde::Deserialize;

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

/// Parse what the user pastes (full URL, query string, or bare code).
pub fn parse_redirect_input(input: &str) -> RedirectInput {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return RedirectInput { code: None, state: None };
    }
    // Try as full URL
    if let Ok(url) = url::Url::parse(trimmed) {
        let code = url.query_pairs().find(|(k, _)| k == "code").map(|(_, v)| v.into_owned());
        let state = url.query_pairs().find(|(k, _)| k == "state").map(|(_, v)| v.into_owned());
        return RedirectInput { code, state };
    }
    // Try as query string
    if trimmed.contains('=') {
        let pairs: std::collections::HashMap<_, _> = url::form_urlencoded::parse(trimmed.as_bytes()).collect();
        return RedirectInput {
            code: pairs.get("code").map(|v| v.to_string()),
            state: pairs.get("state").map(|v| v.to_string()),
        };
    }
    // Bare code
    RedirectInput { code: Some(trimmed.to_owned()), state: None }
}

/// Detect headless/remote environment (SSH, no display server).
pub fn is_remote() -> bool {
    if std::env::var("SSH_TTY").is_ok() || std::env::var("SSH_CONNECTION").is_ok() {
        return true;
    }
    // Linux without display = headless
    #[cfg(target_os = "linux")]
    if std::env::var("DISPLAY").is_err() && std::env::var("WAYLAND_DISPLAY").is_err() {
        return true;
    }
    false
}

/// Generate PKCE verifier (random 32 bytes → base64url) and S256 challenge.
fn generate_pkce() -> (String, String) {
    use sha2::{Digest, Sha256};
    let verifier_bytes: Vec<u8> = (0..32).map(|_| rand::random::<u8>()).collect();
    let verifier = base64_url_encode(&verifier_bytes);
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = base64_url_encode(&hasher.finalize());
    (verifier, challenge)
}

fn base64_url_encode(input: &[u8]) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    URL_SAFE_NO_PAD.encode(input)
}

fn random_state() -> String {
    let bytes: Vec<u8> = (0..16).map(|_| rand::random::<u8>()).collect();
    hex::encode(bytes)
}

/// Build the OpenAI authorization URL with PKCE and required extra params.
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

/// Token exchange result.
pub struct OAuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    /// Unix timestamp (seconds) when access_token expires.
    pub expires_at: i64,
}

/// Exchange authorization code for tokens.
async fn exchange_code(client: &Client, code: &str, verifier: &str) -> rushdino_common::Result<OAuthTokens> {
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
        .map_err(|e| rushdino_common::AppError::Provider(format!("token request failed: {e}")))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(rushdino_common::AppError::Provider(
            format!("token exchange failed ({status}): {body}")
        ));
    }

    let token: TokenResponse = res.json().await
        .map_err(|e| rushdino_common::AppError::Provider(format!("token parse error: {e}")))?;

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

/// Start local HTTP server on port 1455, return the received auth code.
/// Server shuts down as soon as the callback is received.
async fn run_local_callback_server(expected_state: &str) -> rushdino_common::Result<String> {
    use axum::{extract::Query, routing::get, Router};
    use std::collections::HashMap;
    use tokio::net::TcpListener;

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
        .map_err(|e| rushdino_common::AppError::Provider(format!("cannot bind :1455 — {e}")))?;

    // Poll until code arrives (max ~5 minutes)
    let server = axum::serve(listener, app);
    let handle = tokio::spawn(server.into_future());

    for _ in 0..600 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if let Some(code) = code_cell.lock().unwrap().clone() {
            handle.abort();
            return Ok(code);
        }
    }
    handle.abort();
    Err(rushdino_common::AppError::Provider("OAuth callback timed out (5 min)".into()))
}

/// Full OAuth login flow. Returns tokens on success.
pub async fn run() -> rushdino_common::Result<OAuthTokens> {
    let (verifier, challenge) = generate_pkce();
    let state = random_state();
    let auth_url = build_authorize_url(&challenge, &state);
    let client = Client::new();

    let code = if is_remote() {
        // Remote/headless: print URL and ask user to paste redirect
        println!("\nOpen this URL in your LOCAL browser:\n\n{auth_url}\n");
        print!("Paste the redirect URL (or just the code): ");
        std::io::Write::flush(&mut std::io::stdout()).ok();
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)
            .map_err(|e| rushdino_common::AppError::Provider(format!("stdin error: {e}")))?;
        let parsed = parse_redirect_input(&input);
        parsed.code.ok_or_else(|| rushdino_common::AppError::Provider(
            "No authorization code found in pasted input".into()
        ))?
    } else {
        // Local: open browser and start callback server
        println!("Opening browser for OpenAI Codex OAuth…");
        println!("If the browser doesn't open, visit:\n{auth_url}");
        if let Err(e) = open::that(&auth_url) {
            tracing::warn!("failed to open browser: {e}");
        }
        println!("Waiting for OAuth callback on http://localhost:1455/auth/callback …");
        run_local_callback_server(&state).await?
    };

    println!("Exchanging code for tokens…");
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
```

**Note on extra deps needed in `crates/cli/Cargo.toml`:**

```toml
base64 = "0.22"
hex.workspace = true       # already in workspace? if not: hex = "0.4"
rand = "0.8"
sha2 = "0.10"
url = "2"
axum.workspace = true      # already in workspace
```

Add these to `Cargo.toml` workspace deps and to `crates/cli/Cargo.toml`.

**Step 4: Register module in `crates/cli/src/commands/mod.rs`**

```rust
pub mod codex_login;
```

**Step 5: Run tests**

```bash
cargo test -p rushdino-cli codex_login -- --nocapture
```

Expected: 4 tests pass.

**Step 6: Commit**

```bash
git add crates/cli/src/commands/codex_login.rs crates/cli/src/commands/mod.rs Cargo.toml crates/cli/Cargo.toml
git commit -m "feat(cli): add Codex OAuth login module with PKCE flow"
```

---

## Task 4: Wire Codex into `rushdino init`

**Files:**
- Modify: `crates/cli/src/commands/init.rs`

**Step 1: Read the current init flow**

The current `init.rs` uses `dialoguer::Select` with options `["Ollama", "OpenAI", "Anthropic", "Skip"]`. We add `"Codex (OAuth)"` and branch to `codex_login::run()`.

**Step 2: Update the init command**

Replace the options array and add the Codex branch:

```rust
use dialoguer::{Input, Password, Select};
use rushdino_common::{init, Result};

use super::codex_login;

pub fn run() -> Result<()> {
    let home = init::ensure_rushdino_dir()?;

    let options = ["Ollama", "OpenAI", "Anthropic", "Codex (OAuth)", "Skip"];
    let selection = Select::new()
        .with_prompt("Choose provider")
        .items(&options)
        .default(0)
        .interact()
        .unwrap_or(0);

    let mut config = std::fs::read_to_string(home.join("config.toml"))?;
    let mut credentials = std::fs::read_to_string(home.join("credentials.toml"))?;

    match options[selection] {
        "Ollama" => {
            // ... existing Ollama branch unchanged ...
        }
        "OpenAI" => {
            // ... existing OpenAI branch unchanged ...
        }
        "Anthropic" => {
            // ... existing Anthropic branch unchanged ...
        }
        "Codex (OAuth)" => {
            // Run OAuth flow on a tokio runtime (init is sync)
            let tokens = tokio::runtime::Runtime::new()
                .expect("tokio runtime")
                .block_on(codex_login::run())
                .map_err(|e| {
                    eprintln!("OAuth failed: {e}");
                    e
                })?;

            config = config
                .replace("active_provider = \"ollama\"", "active_provider = \"codex\"")
                .replace("active_provider = \"openai\"", "active_provider = \"codex\"")
                .replace("active_provider = \"anthropic\"", "active_provider = \"codex\"");

            credentials = rewrite_value(credentials, "codex_access_token", &tokens.access_token);
            credentials = rewrite_value(credentials, "codex_refresh_token", &tokens.refresh_token);
            credentials = rewrite_value(credentials, "codex_token_expires_at", &tokens.expires_at.to_string());

            println!("Authenticated with OpenAI Codex.");
        }
        _ => {}
    }

    // ... existing brave key prompt and file writes unchanged ...
}
```

**Important:** `rewrite_value` currently handles string values only. For `codex_token_expires_at` (integer), add an overload or handle unquoted writing. The simplest fix: keep it as a quoted string in TOML (TOML allows `"1740000000"` and `figment` will parse it to `Option<i64>` via `serde`). Actually `figment` won't coerce string to i64 — change `codex_token_expires_at` field type to `Option<String>` and parse to i64 in the provider code, OR write it unquoted. The cleanest approach: write it unquoted using a separate helper:

```rust
fn rewrite_int_value(mut doc: String, key: &str, value: i64) -> String {
    let line = format!("{key} = {value}");
    for existing in doc.clone().lines() {
        if existing.trim_start().starts_with(&format!("{key} =")) {
            doc = doc.replace(existing, &line);
            return doc;
        }
    }
    doc
}
```

And in the Codex branch:
```rust
credentials = rewrite_value(credentials, "codex_access_token", &tokens.access_token);
credentials = rewrite_value(credentials, "codex_refresh_token", &tokens.refresh_token);
credentials = rewrite_int_value(credentials, "codex_token_expires_at", tokens.expires_at);
```

**Step 3: Verify compile**

```bash
cargo check -p rushdino-cli
```

Expected: clean.

**Step 4: Commit**

```bash
git add crates/cli/src/commands/init.rs
git commit -m "feat(init): add Codex OAuth provider option"
```

---

## Task 5: Add `CodexProvider` to providers crate

**Files:**
- Modify: `crates/providers/src/lib.rs`

The Codex inference API uses the standard OpenAI Chat Completions format at `https://api.openai.com/v1` with the OAuth `access_token` as a Bearer token — so we simply reuse `OpenAIProvider`.

**Step 1: Add `Codex` variant to `ProviderConfig`**

In `crates/providers/src/types.rs`, find `ProviderConfig` and add:

```rust
Codex {
    /// OAuth access token used as Bearer
    access_token: String,
    model: String,
},
```

**Step 2: Add `Codex(OpenAIProvider)` variant to `Provider` enum and wire it**

In `crates/providers/src/lib.rs`:

```rust
pub enum Provider {
    Ollama(OpenAIProvider),
    OpenAI(OpenAIProvider),
    Anthropic(AnthropicProvider),
    Codex(OpenAIProvider),   // ← add
    Plugin(PluginProvider),
}
```

In `Provider::from_config`, add the arm:

```rust
ProviderConfig::Codex { access_token, model } => {
    Ok(Self::Codex(OpenAIProvider::new(
        "https://api.openai.com/v1".to_owned(),
        model.clone(),
        Some(access_token.clone()),
    )))
}
```

In `Provider::chat`, `Provider::stream_chat`, `Provider::model` — add `Self::Codex(p)` to each match arm alongside `Self::OpenAI(p)`:

```rust
// chat
Self::Ollama(p) | Self::OpenAI(p) | Self::Codex(p) => p.chat(request).await,

// stream_chat
Self::Ollama(p) | Self::OpenAI(p) | Self::Codex(p) => p.stream_chat(request).await,

// model
Self::Ollama(p) | Self::OpenAI(p) | Self::Codex(p) => &p.model,
```

**Step 3: Verify**

```bash
cargo check --workspace
```

Expected: error in `crates/server/src/lib.rs` about `ProviderKind::Codex` — fix in Task 6.

**Step 4: Commit**

```bash
git add crates/providers/src/lib.rs crates/providers/src/types.rs
git commit -m "feat(providers): add Codex provider variant backed by OpenAIProvider"
```

---

## Task 6: Wire Codex provider in server

**Files:**
- Modify: `crates/server/src/lib.rs`

**Step 1: Add Codex arm to the provider match**

Find the `match config.active_provider` block (around line 31) and add:

```rust
ProviderKind::Codex => ProviderConfig::Codex {
    access_token: credentials.codex_access_token.clone().unwrap_or_default(),
    model: config.codex.model.clone(),
},
```

**Step 2: Verify workspace**

```bash
cargo check --workspace
```

Expected: clean, no errors.

**Step 3: Run all tests**

```bash
cargo test --workspace
```

Expected: all existing tests pass + 4 new codex_login tests pass.

**Step 4: Commit**

```bash
git add crates/server/src/lib.rs
git commit -m "feat(server): wire Codex provider when active_provider = codex"
```

---

## Task 7: Update default config template with Codex fields

**Files:**
- Modify: `crates/common/src/init.rs` (or wherever the default `config.toml` template is written)

**Step 1: Find the template**

```bash
grep -rn "active_provider\|openai_api_key" crates/common/src/
```

This will show where the template strings are.

**Step 2: Add Codex model config to `config.toml` template**

Add after the `[anthropic]` section:

```toml
[codex]
model = "gpt-4.1-mini"
```

**Step 3: Add Codex token fields to `credentials.toml` template**

Add after `anthropic_api_key`:

```toml
codex_access_token = ""
codex_refresh_token = ""
codex_token_expires_at = 0
```

**Step 4: Verify init still works**

```bash
cargo check --workspace
cargo test --workspace
```

**Step 5: Commit**

```bash
git add crates/common/src/init.rs   # or whichever file changed
git commit -m "feat(init): add Codex model config and token fields to default templates"
```

---

## Task 8: Final verification

**Step 1: Full workspace check and tests**

```bash
cargo check --workspace
cargo test --workspace
```

Expected: all tests pass, no warnings about unused code.

**Step 2: Manual smoke test (no real tokens needed)**

```bash
# Build the CLI
cargo build -p rushdino-cli

# Confirm Codex option appears in init
./target/debug/rushdino init
# → Select "Codex (OAuth)"
# → If local: browser opens to https://auth.openai.com/oauth/authorize?...
# → If SSH: URL is printed to terminal
# On cancel/timeout: graceful error message, no crash
```

**Step 3: Verify credentials template written correctly**

After a successful OAuth flow, check:
```bash
cat ~/.rushdino/credentials.toml | grep codex
# Expected:
# codex_access_token = "eyJ..."
# codex_refresh_token = "..."
# codex_token_expires_at = 1740000000
```

**Step 4: Commit any fixups, then final commit**

```bash
git add -p   # stage only relevant changes
git commit -m "feat: Codex OAuth login end-to-end"
```

---

## Summary of all new/changed files

| File | Change |
|---|---|
| `Cargo.toml` | Add `oauth2`, `open`, `base64`, `rand`, `sha2`, `url`, `hex` workspace deps |
| `crates/cli/Cargo.toml` | Add above deps |
| `crates/common/src/config.rs` | `ProviderKind::Codex`, `AppConfig.codex`, 3 new `CredentialsConfig` fields |
| `crates/common/src/init.rs` | Update config/credentials templates |
| `crates/cli/src/commands/codex_login.rs` | New — full OAuth PKCE flow |
| `crates/cli/src/commands/mod.rs` | `pub mod codex_login;` |
| `crates/cli/src/commands/init.rs` | Add Codex option, call `codex_login::run()` |
| `crates/providers/src/types.rs` | `ProviderConfig::Codex` variant |
| `crates/providers/src/lib.rs` | `Provider::Codex`, wire all match arms |
| `crates/server/src/lib.rs` | `ProviderKind::Codex` arm in provider match |
