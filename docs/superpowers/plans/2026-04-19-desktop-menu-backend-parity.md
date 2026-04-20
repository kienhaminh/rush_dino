# Desktop-Only Menu Runtime Parity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every backend-dependent feature currently visible from the Tauri desktop app menus behave as a real desktop-backed surface rather than a partial mock or stale readout.

**Architecture:** Work only on Tauri desktop menu-visible surfaces: sidebar (`Search`, `New chat`, `Automations`, `Kanban`, `Plugins`, `Chats`, `Settings`) and settings nav (`Usage`, `Models & API`, `IM Channels`, `Data & Privacy`, plus the current Skills ownership cleanup under Plugins). Treat `crates/server/*` and `crates/common/*` only as support layers for desktop contracts and config. Do not expand into separate web/dashboard/mobile surfaces.

**Tech Stack:** Rust (Axum, serde, tokio), Tauri v2, React 18, TypeScript, TanStack Query, Vite

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `crates/server/src/ws.rs` | Modify | Accept menu-visible chat options on WebSocket requests and pass them into runtime submission |
| `crates/server/src/routes/input_requests.rs` | Modify | Confirm/extend response contract for desktop inline input-request resolution |
| `crates/server/src/routes/providers.rs` | Modify | Support profile create/update/OAuth/test flows required by the visible Models & API menu |
| `crates/server/src/routes/usage_metrics.rs` | Modify | Preserve and document a stable metrics contract consumed by the desktop Usage page |
| `crates/common/src/config.rs` | Modify | Add only the credential/config fields that the visible desktop menus are allowed to edit; do not keep phantom UI-only fields |
| `crates/desktop-app/ui/src/hooks/useChatStream.ts` | Modify | Align outgoing WS payloads and incoming input-request handling with server contracts |
| `crates/desktop-app/ui/src/pages/Chat.tsx` | Modify | Wire profile/thinking selection and inline input-request UX into real server behavior |
| `crates/desktop-app/ui/src/api/providers.ts` | Modify | Add create/update/OAuth/connectivity client functions for visible Models & API actions |
| `crates/desktop-app/ui/src/pages/Providers.tsx` | Modify | Replace fake add-model/OAuth/test flows with backend-backed mutations |
| `crates/desktop-app/ui/src/api/config.ts` | Modify | Use typed nested config shapes for security/execution data shown in visible settings |
| `crates/desktop-app/ui/src/pages/Guardrail.tsx` | Modify | Render Data & Privacy using actual backend config keys |
| `crates/desktop-app/ui/src/api/metrics.ts` | Modify | Pass query params and consume server aggregates/daily shapes directly |
| `crates/desktop-app/ui/src/pages/Metrics.tsx` | Modify | Drive visible Usage filters through backend query params |
| `crates/desktop-app/ui/src/pages/Search.tsx` | Modify | Clarify local-search behavior or switch to a real backend endpoint |
| `crates/desktop-app/ui/src/pages/Plugins.tsx` | Modify | Clarify read-only inventory behavior for menu-visible plugins/skills tabs |
| `crates/desktop-app/ui/src/pages/Skills.tsx` | Modify | Keep the Skills screen consistent with the Plugins tab ownership |
| `crates/desktop-app/ui/src/App.tsx` | Modify | Keep route ownership aligned with the desktop menu structure |
| `crates/desktop-app/ui/src/pages/settings/SettingsLayout.tsx` | Modify | Remove or demote settings entries no longer owned by the visible settings menu |
| `crates/server/src/lib.rs` | Read/Verify | Route registration and desktop API surface used by Tauri |

---

## Chunk 1: Chat Contracts

### Task 1: Make visible chat options real on the WebSocket path

**Files:**
- Modify: `crates/server/src/ws.rs`
- Modify: `crates/desktop-app/ui/src/hooks/useChatStream.ts`
- Modify: `crates/desktop-app/ui/src/pages/Chat.tsx`
- Test: `cargo test -p rushdino-server ws chat`
- Test: `cd crates/desktop-app/ui && npm run typecheck`

- [ ] **Step 1: Write the failing server-side contract test**

Add or extend a Rust test near the existing WS/chat coverage to prove that a WebSocket payload carrying `profile_id` and `thinking_mode` is accepted and propagated instead of silently ignored.

- [ ] **Step 2: Run the targeted backend test to verify the gap**

Run: `cargo test -p rushdino-server ws chat -- --nocapture`
Expected: FAIL because `WsChatRequest` only accepts `conversation_id` and `message`.

- [ ] **Step 3: Extend the WS request model minimally**

In `crates/server/src/ws.rs`, add optional fields for `profile_id` and `thinking_mode` to `WsChatRequest`, parse them in `handle_socket`, and pass them through the runtime submission path without changing unrelated event handling.

- [ ] **Step 4: Align the desktop sender with the new contract**

In `crates/desktop-app/ui/src/hooks/useChatStream.ts`, keep sending `profile_id` and `thinking_mode`, but document the now-real payload shape and remove any fallback comments that imply these options are best-effort only.

- [ ] **Step 5: Make the visible chat UI verifiable**

In `crates/desktop-app/ui/src/pages/Chat.tsx`, ensure the currently selected profile and thinking mode are the only values sent for a turn, and surface a small error if the selected profile is invalid rather than silently falling back.

- [ ] **Step 6: Re-run verification**

Run:
```bash
cargo test -p rushdino-server ws chat -- --nocapture
cd crates/desktop-app/ui && npm run typecheck
```
Expected: targeted Rust tests PASS and desktop UI typecheck PASS.

- [ ] **Step 7: Commit**

```bash
git add crates/server/src/ws.rs crates/desktop-app/ui/src/hooks/useChatStream.ts crates/desktop-app/ui/src/pages/Chat.tsx
git commit -m "fix: wire desktop chat options through websocket runtime"
```

### Task 2: Turn visible input-request pauses into a resolvable UI flow

**Files:**
- Modify: `crates/desktop-app/ui/src/hooks/useChatStream.ts`
- Modify: `crates/desktop-app/ui/src/pages/Chat.tsx`
- Read/Verify: `crates/server/src/routes/input_requests.rs`
- Test: `cd crates/desktop-app/ui && npm run typecheck`

- [ ] **Step 1: Write a failing UI-level contract note/test**

Add a focused TypeScript-level unit or at minimum a typed integration seam that proves an `input_request` event should not degrade into a generic error banner.

- [ ] **Step 2: Run typecheck to capture the current typed surface**

Run: `cd crates/desktop-app/ui && npm run typecheck`
Expected: PASS, but there is no typed path for resolving input requests inline.

- [ ] **Step 3: Introduce an explicit input-request state model**

In `useChatStream.ts`, parse `input_request` into structured state instead of calling `onError`. Preserve existing approval handling.

- [ ] **Step 4: Add the minimal visible UI in Chat**

In `Chat.tsx`, render a compact inline prompt for pending input requests with submit/cancel actions backed by `POST /api/input-requests/:request_id`.

- [ ] **Step 5: Re-run verification**

Run: `cd crates/desktop-app/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add crates/desktop-app/ui/src/hooks/useChatStream.ts crates/desktop-app/ui/src/pages/Chat.tsx
git commit -m "feat: resolve desktop input requests inline"
```

## Chunk 2: Models & API Menu

### Task 4: Replace fake add-model flows with real profile mutations

**Files:**
- Modify: `crates/desktop-app/ui/src/api/providers.ts`
- Modify: `crates/desktop-app/ui/src/pages/Providers.tsx`
- Read/Verify: `crates/server/src/routes/providers.rs`
- Test: `cd crates/desktop-app/ui && npm run typecheck`

- [ ] **Step 1: Add the failing client surface**

Add missing client functions in `api/providers.ts` for `createProfile`, `updateProfile`, `connectProfileOAuthStart`, and `connectProfileOAuthComplete`. Keep signatures aligned with `routes/providers.rs`.

- [ ] **Step 2: Run UI typecheck to capture missing call sites**

Run: `cd crates/desktop-app/ui && npm run typecheck`
Expected: FAIL once the page starts referencing the new client functions and request shapes.

- [ ] **Step 3: Wire Add Model to `POST /api/profiles`**

In `Providers.tsx`, replace the current `onAdded()` no-op close behavior with a real mutation. Ensure a newly created profile invalidates both `profiles` and `config`.

- [ ] **Step 4: Wire OAuth to real backend start/complete routes**

Use the server’s `/connect-oauth/start` and `/connect-oauth/complete` routes. Remove the current `setOauthDone(true)` fake success path.

- [ ] **Step 5: Replace fake connectivity test**

Pick one real backend-backed test path:
`GET /api/providers/:profile_id/models` for a saved profile or a dedicated server-side “validate profile” endpoint if one is added in the same chunk. Do not keep the one-second timeout-based fake result.

- [ ] **Step 6: Re-run verification**

Run: `cd crates/desktop-app/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add crates/desktop-app/ui/src/api/providers.ts crates/desktop-app/ui/src/pages/Providers.tsx
git commit -m "feat: back desktop models page with real profile mutations"
```

### Task 5: Remove phantom credential fields or add them properly

**Files:**
- Modify: `crates/common/src/config.rs`
- Modify: `crates/server/src/routes/config.rs`
- Modify: `crates/desktop-app/ui/src/api/config.ts`
- Modify: `crates/desktop-app/ui/src/pages/Providers.tsx`
- Test: `cargo test -p rushdino-server config -- --nocapture`
- Test: `cd crates/desktop-app/ui && npm run typecheck`

- [ ] **Step 1: Decide the source of truth**

Choose one of:
1. Add `tavily_api_key` and `firecrawl_api_key` to `CredentialsConfig`, masking, patching, and env fallback behavior.
2. Remove those fields from the visible desktop menu until backend support exists.

Record the decision in code comments and, if needed, a short docs note.

- [ ] **Step 2: Implement the minimal consistent path**

If adding fields, update `CredentialsConfig`, response masking, patch merge, and the desktop client types. If removing, delete the visible cards and clean up related casts.

- [ ] **Step 3: Run verification**

Run:
```bash
cargo test -p rushdino-server config -- --nocapture
cd crates/desktop-app/ui && npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add crates/common/src/config.rs crates/server/src/routes/config.rs crates/desktop-app/ui/src/api/config.ts crates/desktop-app/ui/src/pages/Providers.tsx
git commit -m "fix: align desktop external api credentials with backend schema"
```

---

## Chunk 3: Settings Menu Parity

### Task 6: Make Data & Privacy read the real config shape

**Files:**
- Modify: `crates/desktop-app/ui/src/api/config.ts`
- Modify: `crates/desktop-app/ui/src/pages/Guardrail.tsx`
- Read/Verify: `crates/common/src/config.rs`
- Test: `cd crates/desktop-app/ui && npm run typecheck`

- [ ] **Step 1: Tighten the config types**

In `api/config.ts`, replace the loose `Record<string, unknown>` usage for `security` and `execution` with nested types matching `SecurityConfig` and `ExecutionConfig` enough for the visible page.

- [ ] **Step 2: Run typecheck to expose wrong key usage**

Run: `cd crates/desktop-app/ui && npm run typecheck`
Expected: FAIL at current `Guardrail.tsx` field reads like `ssrf_allowlist`, `egress_proxy_enabled`, and flat execution keys.

- [ ] **Step 3: Fix the page**

Update `Guardrail.tsx` to read actual keys:
- `security.allowed_origins`
- `security.allowed_external_hosts`
- `security.trusted_proxies`
- `execution.shell_exec_sandbox.enabled`
- `execution.shell_exec_sandbox.workspace_root`
- `execution.shell_exec_sandbox.extra_write_roots`
- `execution.shell_exec_sandbox.allow_network`

Do not invent fields the backend does not expose.

- [ ] **Step 4: Re-run verification**

Run: `cd crates/desktop-app/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/desktop-app/ui/src/api/config.ts crates/desktop-app/ui/src/pages/Guardrail.tsx
git commit -m "fix: render desktop data and privacy from real config shape"
```

### Task 7: Make Usage filters backend-backed

**Files:**
- Modify: `crates/desktop-app/ui/src/api/metrics.ts`
- Modify: `crates/desktop-app/ui/src/pages/Metrics.tsx`
- Modify: `crates/desktop-app/ui/src/pages/metrics/helpers.ts`
- Read/Verify: `crates/server/src/routes/usage_metrics.rs`
- Test: `cd crates/desktop-app/ui && npm run typecheck`

- [ ] **Step 1: Add a failing metrics-client call shape**

Extend `getUsageMetrics()` to accept `{ start, end, provider, model, conversationId }` so the visible Usage page can pass date filters through to the server.

- [ ] **Step 2: Run typecheck**

Run: `cd crates/desktop-app/ui && npm run typecheck`
Expected: FAIL until `Metrics.tsx` updates its call site.

- [ ] **Step 3: Pass date filters to backend**

Update `Metrics.tsx` so the current date range drives the request query key and request params rather than post-filtering all rows client-side.

- [ ] **Step 4: Consume `aggregates` and `daily` from the server**

Use server-provided `aggregates` and `daily` wherever possible. Keep helper-side derivation only for presentational transforms that the server does not provide.

- [ ] **Step 5: Re-run verification**

Run: `cd crates/desktop-app/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add crates/desktop-app/ui/src/api/metrics.ts crates/desktop-app/ui/src/pages/Metrics.tsx crates/desktop-app/ui/src/pages/metrics/helpers.ts
git commit -m "fix: back desktop usage filters with server metrics queries"
```

---

## Chunk 4: Search and Plugins Menu Scope

### Task 8: Make visible Search behavior explicit and honest

**Files:**
- Modify: `crates/desktop-app/ui/src/pages/Search.tsx`
- Optional Modify: `crates/server/src/lib.rs`
- Optional Modify: `crates/server/src/routes/...` if a real search endpoint is introduced
- Test: `cd crates/desktop-app/ui && npm run typecheck`

- [ ] **Step 1: Choose the scope**

Choose one of:
1. Keep local search and update copy/UI to clearly say it searches loaded chats and agents only.
2. Add a real `/api/search` route and back the menu-visible search box with it.

Do not implement both.

- [ ] **Step 2: Implement the minimal chosen path**

If staying local, update page copy/comments and remove wording that implies a missing backend endpoint is coming “later” unless that roadmap is still intentional. If going backend-backed, add the route and client call with a narrow result type.

- [ ] **Step 3: Re-run verification**

Run: `cd crates/desktop-app/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add crates/desktop-app/ui/src/pages/Search.tsx
git commit -m "fix: clarify desktop search scope"
```

### Task 9: Align Plugins and Skills with current menu ownership

**Files:**
- Modify: `crates/desktop-app/ui/src/pages/Plugins.tsx`
- Modify: `crates/desktop-app/ui/src/pages/Skills.tsx`
- Modify: `crates/desktop-app/ui/src/App.tsx`
- Modify: `crates/desktop-app/ui/src/pages/settings/SettingsLayout.tsx`
- Test: `cd crates/desktop-app/ui && npm run typecheck`

- [ ] **Step 1: Remove duplicated ownership confusion**

Because Skills are menu-owned by Plugins, make the desktop ownership unambiguous:
1. Keep `/settings/skills` only as a compatibility route if required.
2. Remove the visible Skills entry from the settings nav.
3. Point user-facing discovery to `/plugins?tab=skills`.

- [ ] **Step 2: Make Plugins tab copy match capability**

In `Plugins.tsx`, label the `plugins` tab as an inventory/config surface unless actual manage/reconcile actions are added in the same task. Do the same for the `skills` tab if it is still read-only.

- [ ] **Step 3: Re-run verification**

Run: `cd crates/desktop-app/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add crates/desktop-app/ui/src/pages/Plugins.tsx crates/desktop-app/ui/src/pages/Skills.tsx crates/desktop-app/ui/src/App.tsx crates/desktop-app/ui/src/pages/settings/SettingsLayout.tsx
git commit -m "refactor: align desktop skills navigation with plugins menu ownership"
```

---

## Final Verification

- [ ] **Step 1: Run backend verification**

```bash
cargo test -p rushdino-server
```
Expected: PASS, or only pre-existing unrelated failures.

- [ ] **Step 2: Run desktop UI verification**

```bash
cd /Users/kien.ha/Code/RushDino/crates/desktop-app/ui
npm run typecheck
npm run build
```
Expected: PASS.

- [ ] **Step 3: Manual smoke test against visible menus**

Verify manually in the running desktop app:
- `Search` behaves as documented
- `New chat` uses selected profile/thinking mode
- `Automations` controls still work
- `Kanban` still loads/deletes
- `Plugins` tabs match visible ownership
- `Settings > Usage` filters request correctly
- `Settings > Models & API` can create/test/OAuth a profile
- `Settings > IM Channels` still lists/restarts adapters
- `Settings > Data & Privacy` matches `config.toml`

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete backend parity for desktop menu surfaces"
```

---

**Execution notes**
- Keep scope restricted to Tauri desktop menu-visible surfaces.
- Do not expand into `frontend/*`, `landing/*`, `mobile/*`, or any separate browser/dashboard work.
- Do not expand into non-menu desktop routes like `Agents`, `Sessions`, `Workflows`, `Knowledge Graph`, `Logs`, `Approvals`, or `Coding Agents` unless a visible menu item starts depending on them.
- Prefer fixing contracts over adding new surface area.
- If a capability is intentionally read-only, make the copy explicit instead of leaving a fake CTA in place.

Plan complete and saved to `docs/superpowers/plans/2026-04-19-desktop-menu-backend-parity.md`. Ready to execute?
