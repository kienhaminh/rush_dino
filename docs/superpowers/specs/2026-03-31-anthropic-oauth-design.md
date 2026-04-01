# Anthropic OAuth for RushDino Profiles

**Date:** 2026-03-31
**Status:** Approved
**Scope:** Dashboard UI only (web profile config page)

---

## Overview

Add Anthropic OAuth as an authentication option for Anthropic provider profiles, mirroring the existing OpenAI Codex OAuth flow. Users with Claude Pro/Max accounts or Anthropic Console access can authenticate via OAuth instead of providing an API key.

Uses the same paste-based headless flow as Codex: the user is shown an auth URL, opens it in their browser, and pastes the returned authorization code back into the UI.

---

## Architecture

No new endpoints, no new UI components. The existing `/connect-oauth/start` and `/connect-oauth/complete` endpoints and the Codex connect dialog are reused. The only structural addition is a new Rust module for Anthropic-specific OAuth logic.

```
Frontend (profile form)
  → POST /api/providers/{id}/connect-oauth/start   [existing, now branches on provider]
  → POST /api/providers/{id}/connect-oauth/complete [existing, now branches on provider]
  → Rust: rushdino_auth::oauth_pkce::anthropic      [new module]
```

---

## OAuth Flow Differences: Codex vs Anthropic

| | Codex (OpenAI) | Anthropic |
|---|---|---|
| Auth URL | `auth.openai.com/oauth/authorize` | `claude.ai/oauth/authorize` |
| Token URL | OpenAI token endpoint | `console.anthropic.com/v1/oauth/token` |
| Redirect URI | `localhost:1455/auth/callback` | `console.anthropic.com/oauth/code/callback` |
| State param | Random string | Set to verifier (Anthropic quirk) |
| Pasted input | Full redirect URL | `code#state` string |
| Token body encoding | form-encoded | JSON |
| Scopes | `openid profile email offline_access` | `org:create_api_key user:profile user:inference` |

---

## Components

### 1. `crates/auth/src/oauth_pkce/anthropic.rs` (new)

New sibling module to the existing `mod.rs` (OpenAI). Exposes:

- **`start_anthropic_login() → PendingOAuthLogin`**
  Generates PKCE verifier/challenge. Sets `state = verifier` (Anthropic's quirk — state and verifier are the same value). Builds auth URL against `claude.ai/oauth/authorize`.

- **`extract_anthropic_code(input: &str, verifier: &str) → Result<String>`**
  Parses the pasted `code#state` string. Splits on `#`, verifies the state portion equals the verifier, returns the code. Falls back to treating the whole input as the code if no `#` is present.

- **`complete_anthropic_login(client, code, state, verifier) → Result<OAuthTokens>`**
  POSTs JSON to `console.anthropic.com/v1/oauth/token` with `grant_type: authorization_code`, `client_id`, `code`, `state`, `redirect_uri`, `code_verifier`. Returns `OAuthTokens`.

- **`refresh_anthropic_token(client, refresh_token) → Result<OAuthTokens>`**
  POSTs JSON refresh grant to the same token endpoint.

### 2. `crates/server/src/routes/providers.rs` (modified)

Three targeted changes:

**`profile_supports_oauth_connect`** — extend to Anthropic:
```rust
fn profile_supports_oauth_connect(profile: &ProviderProfile) -> bool {
    profile.auth_method == AuthMethod::OAuth
        && matches!(profile.provider_kind, Provider::OpenAI | Provider::Anthropic)
}
```

**`connect_profile_oauth_start`** — branch on provider kind:
```rust
let login = match profile.provider_kind {
    Provider::OpenAI => rushdino_auth::oauth_pkce::start_login(),
    Provider::Anthropic => rushdino_auth::oauth_pkce::anthropic::start_anthropic_login(),
    _ => unreachable!(),
};
```

**`connect_profile_oauth_complete`** — branch on provider kind for code extraction and token exchange:
```rust
let tokens = match profile.provider_kind {
    Provider::OpenAI => {
        let code = extract_authorization_code(&payload.redirect_url, &pending.state)?;
        complete_login(&client, &code, &pending.verifier).await?
    }
    Provider::Anthropic => {
        let code = anthropic::extract_anthropic_code(&payload.redirect_url, &pending.verifier)?;
        anthropic::complete_anthropic_login(&client, &code, &pending.state, &pending.verifier).await?
    }
    _ => unreachable!(),
};
```

### 3. `frontend/src/pages/config/config-section-profiles.tsx` (modified)

- Add "Anthropic OAuth" as a radio option in `AddProfileDialog` when provider is Anthropic, alongside the existing "API Key" option. Mirrors the Codex toggle for OpenAI.
- Reuse the existing OAuth connect dialog. Update the paste label to: `"Paste the authorization code (format: code#state)"`.

### 4. `frontend/src/pages/config/config-profile-utils.ts` (modified)

Add `anthropic_oauth` case to `resolveProviderKindAndAuth()`:
```ts
case "anthropic_oauth":
  return { provider_kind: "anthropic", auth_method: "oauth" };
```

### 5. `frontend/src/lib/api/profiles.ts` (modified)

Rename `startCodexConnect` / `completeCodexConnect` → `startOAuthConnect` / `completeOAuthConnect` to reflect that these functions are now used for both OpenAI and Anthropic profiles.

---

## Data Flow

```
User clicks "Connect with Anthropic OAuth"
  → frontend: startOAuthConnect(profileId)
  → POST /api/providers/{id}/connect-oauth/start
  → backend: start_anthropic_login() → PendingOAuthSession stored, auth_url returned
  → frontend: displays auth URL link + paste box
  → user opens claude.ai, grants permission
  → user pastes code#state string
  → frontend: completeOAuthConnect(profileId, { session_id, redirect_url: pastedCode })
  → POST /api/providers/{id}/connect-oauth/complete
  → backend: extract_anthropic_code() → complete_anthropic_login() → tokens saved to credentials
  → frontend: success, profile card shows OAuth connected
```

---

## Error Handling

- State mismatch in `extract_anthropic_code` → `AppError::Provider("OAuth state mismatch")` (same pattern as Codex)
- Token exchange HTTP error → surface response body in `AppError::Provider`
- Expired pending session → existing 5-minute TTL logic handles this unchanged

---

## Testing

- Unit tests for `extract_anthropic_code`: valid `code#state`, state mismatch, bare code fallback
- Unit tests for `start_anthropic_login`: verifies state == verifier, auth URL contains correct endpoint
- Extend existing `oauth_connect_supports_openai_oauth_profiles` test → add parallel test for Anthropic
- Manual integration: create Anthropic OAuth profile, complete flow end-to-end

---

## Files Changed

| File | Change |
|------|--------|
| `crates/auth/src/oauth_pkce/anthropic.rs` | New |
| `crates/auth/src/oauth_pkce/mod.rs` | Expose `anthropic` sub-module |
| `crates/server/src/routes/providers.rs` | Branch on provider kind in start/complete/supports |
| `frontend/src/pages/config/config-section-profiles.tsx` | Add Anthropic OAuth option + label update |
| `frontend/src/pages/config/config-profile-utils.ts` | Add `anthropic_oauth` case |
| `frontend/src/lib/api/profiles.ts` | Rename Codex → generic OAuth functions |
