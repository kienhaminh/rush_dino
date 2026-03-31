# Anthropic OAuth for RushDino Profiles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Anthropic OAuth as an authentication option for Anthropic provider profiles, mirroring the existing OpenAI Codex OAuth flow.

**Architecture:** New `anthropic.rs` module in `crates/auth/src/oauth_pkce/` handles Anthropic-specific PKCE start, code extraction (parses `code#state` format), and JSON token exchange. The existing provider routes branch on `profile.provider_kind` to invoke the correct OAuth logic — no new endpoints. The frontend profile form gains an "Anthropic OAuth" auth choice alongside the existing "API Key" option.

**Tech Stack:** Rust (reqwest + serde_json for JSON token exchange), React + TypeScript (existing profile form components)

---

## File Map

| File | Change |
|------|--------|
| `crates/auth/src/oauth_pkce/anthropic.rs` | **New** — Anthropic PKCE login, code extraction, token exchange |
| `crates/auth/src/oauth_pkce/mod.rs` | Expose `pub mod anthropic` |
| `crates/server/src/routes/providers.rs` | Branch on provider kind in `start`/`complete`/`supports`; remove `parse_complete_oauth_input` wrapper |
| `frontend/src/lib/api/profiles.ts` | Rename Codex → OAuth functions and types |
| `frontend/src/pages/config/config-profile-utils.ts` | Add `AnthropicAuthChoice`, `isAnthropicOAuthProfile`, update `resolveProviderKindAndAuth` and `formatAuthLabel` |
| `frontend/src/pages/config/config-section-profiles.tsx` | Add Anthropic auth selector in `AddProfileDialog`; update OAuth UI labels per provider |

---

## Task 1: Add `crates/auth/src/oauth_pkce/anthropic.rs`

**Files:**
- Create: `crates/auth/src/oauth_pkce/anthropic.rs`

- [ ] **Step 1: Write the failing tests first**

Create `crates/auth/src/oauth_pkce/anthropic.rs` with only the test module:

```rust
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

pub fn start_anthropic_login() -> PendingOAuthLogin { todo!() }
pub fn extract_anthropic_code(input: &str, verifier: &str) -> Result<String> { todo!() }
pub async fn complete_anthropic_login(client: &Client, code: &str, verifier: &str) -> Result<OAuthTokens> { todo!() }
pub async fn refresh_anthropic_token(client: &Client, refresh_token: &str) -> Result<OAuthTokens> { todo!() }

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
```

- [ ] **Step 2: Expose the module so tests compile**

Add to `crates/auth/src/oauth_pkce/mod.rs` after the existing `mod token;` line:

```rust
pub mod anthropic;
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/kien.ha/Code/RushDino && cargo test -p rushdino-auth -- anthropic 2>&1 | head -50
```

Expected: tests fail with `not yet implemented` (from `todo!()`)

- [ ] **Step 4: Implement `start_anthropic_login`**

Replace the `todo!()` stub for `start_anthropic_login`:

```rust
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
```

- [ ] **Step 5: Implement `extract_anthropic_code`**

Replace the `todo!()` stub:

```rust
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
```

- [ ] **Step 6: Implement `complete_anthropic_login` and `refresh_anthropic_token`**

Replace both `todo!()` stubs:

```rust
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
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd /Users/kien.ha/Code/RushDino && cargo test -p rushdino-auth -- anthropic 2>&1
```

Expected: all 5 `anthropic` tests pass

- [ ] **Step 8: Confirm full auth crate test suite still passes**

```bash
cd /Users/kien.ha/Code/RushDino && cargo test -p rushdino-auth 2>&1
```

Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
cd /Users/kien.ha/Code/RushDino && git add crates/auth/src/oauth_pkce/anthropic.rs crates/auth/src/oauth_pkce/mod.rs
git commit -m "feat(auth): add Anthropic OAuth PKCE module"
```

---

## Task 2: Update `providers.rs` to support Anthropic OAuth

**Files:**
- Modify: `crates/server/src/routes/providers.rs`

- [ ] **Step 1: Update `profile_supports_oauth_connect` and its tests**

Replace:
```rust
fn profile_supports_oauth_connect(profile: &ProviderProfile) -> bool {
    profile.provider_kind == Provider::OpenAI && profile.auth_method == AuthMethod::OAuth
}
```

With:
```rust
fn profile_supports_oauth_connect(profile: &ProviderProfile) -> bool {
    profile.auth_method == AuthMethod::OAuth
        && matches!(profile.provider_kind, Provider::OpenAI | Provider::Anthropic)
}
```

In the `#[cfg(test)]` block, update the test that currently asserts Anthropic OAuth is **rejected** — it must now assert it is **accepted**. Replace these lines inside `oauth_connect_rejects_non_oauth_profiles`:

```rust
// Before (remove this assertion):
assert!(!profile_supports_oauth_connect(&profile(
    Provider::Anthropic,
    AuthMethod::OAuth,
)));
```

Add a new test:

```rust
#[test]
fn oauth_connect_supports_anthropic_oauth_profiles() {
    assert!(profile_supports_oauth_connect(&profile(
        Provider::Anthropic,
        AuthMethod::OAuth,
    )));
}
```

- [ ] **Step 2: Run tests to verify the support check tests pass**

```bash
cd /Users/kien.ha/Code/RushDino && cargo test -p rushdino-server -- oauth_connect 2>&1
```

Expected: `oauth_connect_supports_openai_oauth_profiles`, `oauth_connect_supports_anthropic_oauth_profiles`, `oauth_connect_rejects_non_oauth_profiles` all pass

- [ ] **Step 3: Update `connect_profile_oauth_start` to branch on provider**

Replace the `start_login()` call in `connect_profile_oauth_start`:

```rust
// Before:
let login = rushdino_auth::oauth_pkce::start_login();

// After:
let login = match profile.provider_kind {
    Provider::OpenAI => rushdino_auth::oauth_pkce::start_login(),
    Provider::Anthropic => rushdino_auth::oauth_pkce::anthropic::start_anthropic_login(),
    _ => unreachable!(),
};
```

- [ ] **Step 4: Update `connect_profile_oauth_complete` to branch on provider**

Remove the `parse_complete_oauth_input` helper call and replace with provider-branched logic.

Replace from:
```rust
let code = parse_complete_oauth_input(&pending, &payload.redirect_url)?;
let client = reqwest::Client::new();
let tokens = rushdino_auth::oauth_pkce::complete_login(&client, &code, &pending.verifier)
    .await?;
```

With:
```rust
let client = reqwest::Client::new();
let tokens = match profile.provider_kind {
    Provider::OpenAI => {
        let code = rushdino_auth::oauth_pkce::extract_authorization_code(
            &payload.redirect_url,
            &pending.state,
        )?;
        rushdino_auth::oauth_pkce::complete_login(&client, &code, &pending.verifier).await?
    }
    Provider::Anthropic => {
        let code = rushdino_auth::oauth_pkce::anthropic::extract_anthropic_code(
            &payload.redirect_url,
            &pending.verifier,
        )?;
        rushdino_auth::oauth_pkce::anthropic::complete_anthropic_login(
            &client,
            &code,
            &pending.verifier,
        )
        .await?
    }
    _ => unreachable!(),
};
```

- [ ] **Step 5: Remove `parse_complete_oauth_input` and update its test**

Delete the `parse_complete_oauth_input` function (lines 174–179) — it was a thin wrapper that is now inlined.

In the test module, the `oauth_complete_rejects_state_mismatch` test uses `parse_complete_oauth_input`. Replace it with a test that uses `extract_authorization_code` directly (which is already tested in `rushdino-auth` — so just remove the test to avoid duplication):

Delete the entire `oauth_complete_rejects_state_mismatch` test and its `use super::parse_complete_oauth_input` import from the test module. Also remove `parse_complete_oauth_input` from the `use super::{...}` import in the test block.

- [ ] **Step 6: Build and run all server tests**

```bash
cd /Users/kien.ha/Code/RushDino && cargo test -p rushdino-server 2>&1
```

Expected: all tests pass

- [ ] **Step 7: Full workspace build check**

```bash
cd /Users/kien.ha/Code/RushDino && cargo build 2>&1
```

Expected: clean build, no errors

- [ ] **Step 8: Commit**

```bash
cd /Users/kien.ha/Code/RushDino && git add crates/server/src/routes/providers.rs
git commit -m "feat(server): add Anthropic OAuth support to provider routes"
```

---

## Task 3: Rename Codex → OAuth in `frontend/src/lib/api/profiles.ts`

**Files:**
- Modify: `frontend/src/lib/api/profiles.ts`

- [ ] **Step 1: Rename types and functions**

Make these replacements throughout the file:

| Old | New |
|-----|-----|
| `StartCodexConnectResponse` | `StartOAuthConnectResponse` |
| `CompleteCodexConnectRequest` | `CompleteOAuthConnectRequest` |
| `startCodexConnect` | `startOAuthConnect` |
| `completeCodexConnect` | `completeOAuthConnect` |

Also update the file header comment from:
```typescript
// Provider profiles API — CRUD for profiles and Codex OAuth connect flow.
```
To:
```typescript
// Provider profiles API — CRUD for profiles and OAuth connect flow.
```

The final functions should look like:

```typescript
export type StartOAuthConnectResponse = {
  session_id: string;
  auth_url: string;
};

export type CompleteOAuthConnectRequest = {
  session_id: string;
  redirect_url: string;
};

export async function startOAuthConnect(profileId: string): Promise<StartOAuthConnectResponse> {
  const endpoint = `/api/providers/${encodeURIComponent(profileId)}/connect-oauth/start`;
  const response = await fetch(endpoint, { method: 'POST' });
  return parseJsonOrThrow(response, endpoint);
}

export async function completeOAuthConnect(
  profileId: string,
  payload: CompleteOAuthConnectRequest,
): Promise<{ status: string }> {
  const endpoint = `/api/providers/${encodeURIComponent(profileId)}/connect-oauth/complete`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}
```

- [ ] **Step 2: Update the import in `config-section-profiles.tsx`**

In `frontend/src/pages/config/config-section-profiles.tsx`, update the import at the top:

```typescript
// Before:
completeCodexConnect,
startCodexConnect,

// After:
completeOAuthConnect,
startOAuthConnect,
```

- [ ] **Step 3: Update usages in `config-section-profiles.tsx`**

In `handleConnectStart`, replace:
```typescript
const started = await startCodexConnect(profile.id);
```
With:
```typescript
const started = await startOAuthConnect(profile.id);
```

In `handleConnectComplete`, replace:
```typescript
await completeCodexConnect(profile.id, {
```
With:
```typescript
await completeOAuthConnect(profile.id, {
```

- [ ] **Step 4: TypeScript build check**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit 2>&1
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /Users/kien.ha/Code/RushDino && git add frontend/src/lib/api/profiles.ts frontend/src/pages/config/config-section-profiles.tsx
git commit -m "refactor(frontend): rename startCodexConnect/completeCodexConnect to generic OAuth names"
```

---

## Task 4: Update `config-profile-utils.ts` for Anthropic OAuth

**Files:**
- Modify: `frontend/src/pages/config/config-profile-utils.ts`

- [ ] **Step 1: Add `AnthropicAuthChoice` type and `isAnthropicOAuthProfile`**

Replace the full contents of `config-profile-utils.ts` with:

```typescript
import type { AuthMethod, ProviderKind, ProviderProfile } from '../../lib/types';

export type UIProvider = 'openai' | 'anthropic' | 'ollama';
export type OpenAIAuthChoice = 'apikey' | 'codex_oauth';
export type AnthropicAuthChoice = 'apikey' | 'anthropic_oauth';
export type AuthChoice = OpenAIAuthChoice | AnthropicAuthChoice;

export function isCodexOAuthProfile(
  profile: Pick<ProviderProfile, 'provider_kind' | 'auth_method'>,
): boolean {
  return (
    profile.auth_method === 'oauth' &&
    (profile.provider_kind === 'openai' || profile.provider_kind === 'openai_codex')
  );
}

export function isAnthropicOAuthProfile(
  profile: Pick<ProviderProfile, 'provider_kind' | 'auth_method'>,
): boolean {
  return profile.auth_method === 'oauth' && profile.provider_kind === 'anthropic';
}

export function formatAuthLabel(profile: Pick<ProviderProfile, 'provider_kind' | 'auth_method'>) {
  if (isCodexOAuthProfile(profile)) return 'Codex (OAuth)';
  if (isAnthropicOAuthProfile(profile)) return 'Anthropic OAuth';
  if (profile.auth_method === 'apikey') return 'API Key';
  if (profile.auth_method === 'oauth') return 'OAuth';
  return profile.auth_method;
}

export function resolveProviderKindAndAuth(
  uiProvider: UIProvider,
  authChoice: AuthChoice,
): { provider_kind: ProviderKind; auth_method: AuthMethod } {
  if (uiProvider === 'openai') {
    if (authChoice === 'codex_oauth') {
      return { provider_kind: 'openai', auth_method: 'oauth' };
    }
    return { provider_kind: 'openai', auth_method: 'apikey' };
  }
  if (uiProvider === 'anthropic') {
    if (authChoice === 'anthropic_oauth') {
      return { provider_kind: 'anthropic', auth_method: 'oauth' };
    }
    return { provider_kind: 'anthropic', auth_method: 'apikey' };
  }
  return { provider_kind: 'ollama', auth_method: 'none' };
}

export function normalizeOAuthRedirectInput(input: string): string {
  return input.trim();
}
```

- [ ] **Step 2: TypeScript build check**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit 2>&1
```

Expected: no errors (the `AuthChoice` type replaces `OpenAIAuthChoice` in `resolveProviderKindAndAuth`'s signature — callers passing `'apikey'` or `'codex_oauth'` still typecheck because `OpenAIAuthChoice ⊂ AuthChoice`)

- [ ] **Step 3: Commit**

```bash
cd /Users/kien.ha/Code/RushDino && git add frontend/src/pages/config/config-profile-utils.ts
git commit -m "feat(frontend): add AnthropicAuthChoice and isAnthropicOAuthProfile to profile utils"
```

---

## Task 5: Update `config-section-profiles.tsx` — AddProfileDialog and OAuth UI

**Files:**
- Modify: `frontend/src/pages/config/config-section-profiles.tsx`

- [ ] **Step 1: Update imports**

Add `AnthropicAuthChoice` and `isAnthropicOAuthProfile` to the import from `config-profile-utils`:

```typescript
// Before:
import {
  formatAuthLabel,
  isCodexOAuthProfile,
  normalizeOAuthRedirectInput,
  resolveProviderKindAndAuth,
  type OpenAIAuthChoice,
  type UIProvider,
} from './config-profile-utils';

// After:
import {
  formatAuthLabel,
  isAnthropicOAuthProfile,
  isCodexOAuthProfile,
  normalizeOAuthRedirectInput,
  resolveProviderKindAndAuth,
  type AnthropicAuthChoice,
  type OpenAIAuthChoice,
  type UIProvider,
} from './config-profile-utils';
```

- [ ] **Step 2: Update `AddProfileDialog` — add `anthropicAuthChoice` state**

Inside `AddProfileDialog`, add state for Anthropic auth choice alongside the existing OpenAI one:

```typescript
const [openAIAuthChoice, setOpenAIAuthChoice] = useState<OpenAIAuthChoice>('apikey');
const [anthropicAuthChoice, setAnthropicAuthChoice] = useState<AnthropicAuthChoice>('apikey');
```

- [ ] **Step 3: Update `handleProviderChange` to reset Anthropic auth choice on provider switch**

```typescript
const handleProviderChange = (v: string) => {
  setUIProvider(v as UIProvider);
  setOpenAIAuthChoice('apikey');
  setAnthropicAuthChoice('apikey');
  // Reset model to the new provider's default
  const { provider_kind, auth_method } = resolveProviderKindAndAuth(v as UIProvider, 'apikey');
  setModel(getDefaultModelId(provider_kind, auth_method));
};
```

- [ ] **Step 4: Update the model derivation to use the right auth choice per provider**

Replace the current `resolveProviderKindAndAuth` call used to derive `resolvedKind`/`resolvedAuth`:

```typescript
// Before:
const { provider_kind: resolvedKind, auth_method: resolvedAuth } =
  uiProvider !== ''
    ? resolveProviderKindAndAuth(uiProvider as UIProvider, openAIAuthChoice)
    : { provider_kind: '', auth_method: '' };

// After:
const activeAuthChoice =
  uiProvider === 'anthropic' ? anthropicAuthChoice : openAIAuthChoice;
const { provider_kind: resolvedKind, auth_method: resolvedAuth } =
  uiProvider !== ''
    ? resolveProviderKindAndAuth(uiProvider as UIProvider, activeAuthChoice)
    : { provider_kind: '', auth_method: '' };
```

- [ ] **Step 5: Update `handleAuthChange` to handle both providers**

Replace the existing `handleAuthChange`:

```typescript
// Before:
const handleAuthChange = (v: OpenAIAuthChoice) => {
  setOpenAIAuthChoice(v);
  if (uiProvider === 'openai') {
    const { provider_kind, auth_method } = resolveProviderKindAndAuth('openai', v);
    setModel(getDefaultModelId(provider_kind, auth_method));
  }
};

// After:
const handleOpenAIAuthChange = (v: OpenAIAuthChoice) => {
  setOpenAIAuthChoice(v);
  const { provider_kind, auth_method } = resolveProviderKindAndAuth('openai', v);
  setModel(getDefaultModelId(provider_kind, auth_method));
};

const handleAnthropicAuthChange = (v: AnthropicAuthChoice) => {
  setAnthropicAuthChoice(v);
  const { provider_kind, auth_method } = resolveProviderKindAndAuth('anthropic', v);
  setModel(getDefaultModelId(provider_kind, auth_method));
};
```

- [ ] **Step 6: Update `handleAdd` to use the right auth choice per provider**

```typescript
const handleAdd = async () => {
  if (!name || !uiProvider) return;
  setSaving(true);
  try {
    const authChoice = uiProvider === 'anthropic' ? anthropicAuthChoice : openAIAuthChoice;
    const { provider_kind, auth_method } = resolveProviderKindAndAuth(
      uiProvider as UIProvider,
      authChoice,
    );
    const default_model = model || getDefaultModelId(provider_kind, auth_method);
    const payload: any = { name, provider_kind, auth_method, default_model };
    if (auth_method === 'apikey' && apiKey) {
      payload.api_key = apiKey;
    }
    await createProfile(payload);
    toast.success('Profile created successfully.');
    setOpen(false);
    setName('');
    setUIProvider('');
    setOpenAIAuthChoice('apikey');
    setAnthropicAuthChoice('apikey');
    setModel('');
    setApiKey('');
    onRefresh();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to create profile.');
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 7: Update `showApiKeyInput` to also exclude `anthropic_oauth`**

```typescript
// Before:
const showApiKeyInput =
  uiProvider !== '' &&
  uiProvider !== 'ollama' &&
  !(uiProvider === 'openai' && openAIAuthChoice === 'codex_oauth');

// After:
const showApiKeyInput =
  uiProvider !== '' &&
  uiProvider !== 'ollama' &&
  !(uiProvider === 'openai' && openAIAuthChoice === 'codex_oauth') &&
  !(uiProvider === 'anthropic' && anthropicAuthChoice === 'anthropic_oauth');
```

- [ ] **Step 8: Add Anthropic auth selector in the dialog JSX**

After the existing OpenAI auth selector block (`{uiProvider === 'openai' && (...)}`) add:

```tsx
{uiProvider === 'anthropic' && (
  <div className="space-y-1.5">
    <label className="text-xs font-medium">Authentication</label>
    <Select
      value={anthropicAuthChoice}
      onValueChange={(v) => handleAnthropicAuthChange(v as AnthropicAuthChoice)}
    >
      <SelectTrigger className="border-border/40 focus:border-primary/40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-border/40 bg-popover/95 backdrop-blur-xl shadow-2xl">
        <SelectItem value="apikey">API Key</SelectItem>
        <SelectItem value="anthropic_oauth">Anthropic OAuth</SelectItem>
      </SelectContent>
    </Select>
  </div>
)}
```

Also update the existing OpenAI auth selector to use `handleOpenAIAuthChange` (renamed in Step 5):

```tsx
// Before:
onValueChange={(v) => handleAuthChange(v as OpenAIAuthChoice)}
// After:
onValueChange={(v) => handleOpenAIAuthChange(v as OpenAIAuthChoice)}
```

- [ ] **Step 9: Update OAuth connect UI in `ProfileCard` to be provider-aware**

The existing OAuth section (inside `{profile.auth_method === 'oauth' && (...)}`) has labels and placeholder text hardcoded for Codex. Update the toast messages in `handleConnectStart` and `handleConnectComplete` to be provider-neutral:

```typescript
// In handleConnectStart — Before:
const id = toast.loading('Generating OpenAI OAuth link...', {
  description: 'Open the link on your local machine, then paste the redirect URL here.',
});

// After:
const id = toast.loading('Generating OAuth link...', {
  description: 'Open the link in your browser, then paste the code here.',
});
```

```typescript
// In handleConnectComplete — Before:
const id = toast.loading('Completing OpenAI OAuth...', {
  description: 'Validating the pasted redirect URL and exchanging the code.',
});

// After:
const id = toast.loading('Completing OAuth...', {
  description: 'Validating the pasted code and exchanging for tokens.',
});
```

Update the paste instructions in the JSX to be provider-aware. Replace the static paste step 2 block:

```tsx
// Before:
<div className="space-y-1.5">
  <p className="text-xs font-medium text-foreground">
    2. Paste the full redirect URL after login
  </p>
  <Input
    value={oauthRedirectUrl}
    onChange={(e) => setOauthRedirectUrl(e.target.value)}
    placeholder="http://localhost:1455/auth/callback?code=..."
    className="font-mono text-xs border-border/40 bg-background"
  />
  <p className="text-[11px] text-muted-foreground">
    If the local browser shows a localhost callback URL, copy that entire URL and paste it here.
  </p>
</div>

// After:
<div className="space-y-1.5">
  <p className="text-xs font-medium text-foreground">
    {isAnthropicOAuthProfile(profile)
      ? '2. Paste the authorization code'
      : '2. Paste the full redirect URL after login'}
  </p>
  <Input
    value={oauthRedirectUrl}
    onChange={(e) => setOauthRedirectUrl(e.target.value)}
    placeholder={
      isAnthropicOAuthProfile(profile)
        ? 'code#state (e.g. abc123#verifier)'
        : 'http://localhost:1455/auth/callback?code=...'
    }
    className="font-mono text-xs border-border/40 bg-background"
  />
  <p className="text-[11px] text-muted-foreground">
    {isAnthropicOAuthProfile(profile)
      ? 'Copy the authorization code shown after granting access (format: code#state).'
      : 'If the local browser shows a localhost callback URL, copy that entire URL and paste it here.'}
  </p>
</div>
```

- [ ] **Step 10: TypeScript build check**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit 2>&1
```

Expected: no errors

- [ ] **Step 11: Vite dev build check**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npx vite build 2>&1 | tail -20
```

Expected: build succeeds

- [ ] **Step 12: Commit**

```bash
cd /Users/kien.ha/Code/RushDino && git add frontend/src/pages/config/config-section-profiles.tsx
git commit -m "feat(frontend): add Anthropic OAuth option to profile creation and connect UI"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full Rust test suite**

```bash
cd /Users/kien.ha/Code/RushDino && cargo test 2>&1 | tail -30
```

Expected: all tests pass

- [ ] **Step 2: Full TypeScript build**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit 2>&1
```

Expected: no errors

- [ ] **Step 3: Manual smoke test checklist**

Verify in the running app:
1. Config → Profiles → Add Profile → select Anthropic → auth dropdown shows "API Key" and "Anthropic OAuth"
2. Select "API Key" → API key input appears, create works as before
3. Select "Anthropic OAuth" → no API key input, profile creates with `auth_method: oauth`
4. Expand the Anthropic OAuth profile → OAuth connect section appears
5. Click "Generate Auth Link" → auth URL appears pointing to `claude.ai/oauth/authorize`
6. Paste instructions say "Paste the authorization code (format: code#state)"
7. OpenAI Codex profiles are unchanged — paste instructions still say "Paste the full redirect URL"
