# Headless OAuth UI Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the web OAuth connection flow out of the headless server browser launch path by generating the auth URL in the UI and completing authentication from a pasted redirect URL.

**Architecture:** Split the current server-side OAuth connect route into a two-step flow. The server owns PKCE verifier and state in a short-lived in-memory pending-session store, exposes start and complete endpoints, and the Config UI renders the auth URL plus a paste box for the returned redirect URL.

**Tech Stack:** Rust, Axum, Tokio, Reqwest, React, TypeScript, Vitest

---

## Chunk 1: Backend OAuth Session Flow

### Task 1: Add auth-level helpers for start/complete

**Files:**
- Modify: `crates/auth/src/oauth_pkce/mod.rs`
- Test: `crates/auth/src/oauth_pkce/mod.rs`

- [ ] **Step 1: Write the failing test**

Add unit tests for parsing pasted redirect input and for building a start payload that includes a verifier, state, and auth URL.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p rushdino-auth oauth_pkce`
Expected: FAIL because the new start/complete helpers are not implemented yet.

- [ ] **Step 3: Write minimal implementation**

Add a small public type for a pending OAuth login and helpers to create a start session and extract a validated code/state pair from pasted input.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p rushdino-auth oauth_pkce`
Expected: PASS

### Task 2: Add pending-session storage to server state

**Files:**
- Modify: `crates/server/src/state.rs`
- Test: `crates/server/src/state.rs` or route tests in `crates/server/src/routes/providers.rs`

- [ ] **Step 1: Write the failing test**

Add a test that inserts a pending OAuth session, reads it back, and removes it after completion or expiry.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p rushdino-server oauth`
Expected: FAIL because the pending-session store does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add an `Arc<RwLock<HashMap<...>>>` store for pending OAuth sessions in `AppState`, with helper methods for insert/get/remove and expiry checks.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p rushdino-server oauth`
Expected: PASS

### Task 3: Replace the single connect endpoint with start/complete endpoints

**Files:**
- Modify: `crates/server/src/routes/providers.rs`
- Modify: `crates/server/src/lib.rs`
- Test: `crates/server/src/routes/providers.rs`

- [ ] **Step 1: Write the failing test**

Add tests for:
- start endpoint rejects unsupported profiles
- complete endpoint rejects unknown session ids
- complete endpoint rejects state mismatch

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p rushdino-server providers::tests`
Expected: FAIL because the new route handlers and validation paths do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement `connect_profile_oauth_start` and `connect_profile_oauth_complete`, wire them into the router, validate pasted redirect input, exchange the code for tokens, persist credentials, and clear the pending session.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p rushdino-server providers::tests`
Expected: PASS

## Chunk 2: Frontend OAuth Paste Flow

### Task 4: Update API client for two-step OAuth

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/pages/config/config-section-profiles.node.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests for the new API request shapes:
- start returns `auth_url` and `session_id`
- complete posts `session_id` and pasted redirect input

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- frontend/src/pages/config/config-section-profiles.node.test.ts`
Expected: FAIL because the helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Replace the old `connectCodex()` helper with `startCodexConnect()` and `completeCodexConnect()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- frontend/src/pages/config/config-section-profiles.node.test.ts`
Expected: PASS

### Task 5: Replace the one-click OAuth button with a paste-driven UI

**Files:**
- Modify: `frontend/src/pages/config/config-section-profiles.tsx`
- Test: `frontend/src/pages/config/config-section-profiles.node.test.ts` or nearby UI tests if present

- [ ] **Step 1: Write the failing test**

Add tests for the OAuth UI state machine:
- start request stores auth URL and session id
- submit is disabled without pasted input
- complete resets local state after success

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- frontend/src/pages/config/config-section-profiles.node.test.ts`
Expected: FAIL because the UI helpers and state transitions do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Render:
- a button to generate the auth link
- a read-only field or link for the returned URL
- a textarea/input for pasted redirect URL
- a submit button to finish authentication

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- frontend/src/pages/config/config-section-profiles.node.test.ts`
Expected: PASS

## Chunk 3: Verification

### Task 6: Run focused verification

**Files:**
- Modify: none

- [ ] **Step 1: Run backend tests**

Run: `cargo test -p rushdino-auth oauth_pkce`
Expected: PASS

- [ ] **Step 2: Run server tests**

Run: `cargo test -p rushdino-server providers::tests`
Expected: PASS

- [ ] **Step 3: Run frontend tests**

Run: `npm test -- frontend/src/pages/config/config-section-profiles.node.test.ts`
Expected: PASS
