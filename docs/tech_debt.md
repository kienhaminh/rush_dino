# Tech debt

Living register from the 2026-08-18 full-codebase audit. Status: `open` until code changes.

Source notes: [notes.md](./notes.md). Related gap list (CRUD only): [first-class-crud-gaps.md](./references/architecture/gaps/first-class-crud-gaps.md).

## Fix order

1. TD-01, TD-02, TD-03 — host RCE / shared channel transcript
2. TD-04 — HQ usable without a provider
3. TD-05, TD-06, TD-07 — attribution and conversation identity
4. TD-08 … — auth defaults, client HMAC, SSRF, config/secrets

## Open

### TD-01 — Critical — Sandbox is not enforced

`LocalSystemBroker` runs `Command::new("sh").args(["-c", …])`. Per-agent `sandbox.yaml` is loaded onto templates and ignored. Doctor/UI can show sandbox on.

- Evidence: `crates/server/src/system_broker.rs`, `crates/server/src/lib.rs` (`LocalSystemBroker`)
- Fix: confine shell (SBPL / `sandbox-exec` or equivalent) or stop advertising sandbox. Wire `GuardrailBroker` only after fixing `echo *` / `cat *` always-allow.

### TD-02 — Critical — Dangerous shell auto-approves

If the approval session is missing (`no active session`), the broker auto-approves. Commands containing `.rushdino` skip the gate. Telegram / Discord / Slack / inbox dispatchers do not register an approval session.

- Evidence: `crates/server/src/system_broker.rs` (`ensure_approval`), `crates/agent/src/tools/bash.rs` (`is_dangerous_command` substring), `crates/gateway/src/router.rs`
- Fix: fail-closed. Register a gateway approval owner. Never auto-approve. Stop substring skip.

### TD-03 — Critical — Channel users share one conversation

Non-mobile gateway sessions use `conversation_id = main::{channel}`. Groups skip pairing (`!is_direct_message` → Allow). Slack DMs have no pairing path.

- Evidence: `crates/gateway/src/session.rs`, `crates/server/src/channel_pairing.rs`, extension `lib.rs` files
- Fix: `main::{channel}::{actor_id}`. Require pairing/allowlist per actor in groups; require mention.

### TD-04 — Critical — Disk HQ APIs require a live engine

`GET/POST /api/agents` and assign/handoff call `state.engine()?`. Empty `default_profile_id` → `AppError::Provider` → 502. Persist/list do not need an LLM.

- Evidence: `crates/server/src/runtime_state.rs`, `crates/server/src/routes/agents.rs`, `crates/server/src/routes/agent_team.rs`
- Fix: serve `AgentManager` + message store without an engine. 503 + setup hint only on execute paths.

### TD-05 — High — Handoff sender is caller-supplied

HTTP body `from` wins. `from == "operator"` or any existing agent name is accepted. `agent_inbox` tool writes LLM-chosen `from`. Persist can create an agent named `operator`.

- Evidence: `crates/agent/src/team_ops.rs` (`handoff`), `crates/server/src/routes/agent_team.rs`, `crates/agent/src/tools/agent_inbox.rs`
- Fix: ignore client `from`. Bind to path id / executing agent. Reserve `operator`. Normalize sender.

### TD-06 — High — Assignment / kanban / delegate share conversation id

`assign_work` uses `conversation_id = agent_id`. Kanban and `delegate` use the same key (`INSERT OR IGNORE`). Inbox replies use a new UUID then archive.

- Evidence: `crates/agent/src/team_ops.rs`, `crates/agent/src/kanban_dispatcher.rs`, `crates/agent/src/tools/delegate_to_agent.rs`, `crates/agent/src/inbox_dispatcher.rs`
- Fix: unique id per assignment/task (`assign-{uuid}` / `task-{id}`). Stop using agent name as PK.

### TD-07 — High — Kanban claim is TOCTOU

Count + read, then `UPDATE` without `status='backlog'`. Any `execute_task` error (including “not in backlog”) marks the task Failed. Capacity check races past max concurrent.

- Evidence: `crates/agent/src/kanban_store.rs` (`claim_task`, `update_task_status`), `crates/agent/src/kanban_dispatcher.rs`
- Fix: single `UPDATE … WHERE id=? AND status='backlog'`; `rows_affected==0` → conflict, do not fail the task.

### TD-08 — High — Auth fail-open on non-loopback

HMAC and dashboard auth default off. `AppConfig::default().host` is `0.0.0.0`. Mutating routes (upgrade, restart, credentials, files, assign) have no extra auth when HMAC is off.

- Evidence: `crates/common/src/config.rs`, `crates/server/src/middleware.rs`
- Fix: default bind loopback. Fail-closed auth when `host` is not loopback.

### TD-09 — High — CLI does not sign HMAC

Desktop always HMAC-signs. CLI `ApiClient` sends unsigned requests. Enabling HMAC (doctor secure path) 401s `rushdino agents *`.

- Evidence: `crates/cli/src/api_client.rs`, `crates/desktop-app/src/api_client.rs`
- Fix: sign with `credentials.api_secret` using the same canonical HMAC as the desktop signer.

### TD-10 — High — Chat cannot target a named teammate

WS/REST chat send `profile_id` only. Channels always `submit_gateway_run` on the default engine. Assign work is inbox-only and `kind=agent` conversations are hidden from the session list.

- Evidence: `crates/desktop-app/src/chat_socket.rs`, `crates/server/src/ws.rs`, `crates/gateway/src/router.rs`, `crates/agent/src/conversation.rs`
- Fix: accept `agent_id` on WS/chat; surface agent conversations; parse `@teammate` on channels after auth.

### TD-11 — High — `web_fetch` SSRF

Sync `validate_url` accepts hostnames. `validate_url_async` is unused. Redirects (limit 3) are not revalidated. `allowed_external_hosts` is not passed from config.

- Evidence: `crates/agent/src/tools/web_fetch.rs`, `crates/security/src/validation.rs`
- Fix: async DNS + block loopback/link-local/metadata; revalidate redirects; honor allow-list.

### TD-12 — High — `data_capable` lies and can grant bash

True if name is `data-analyst`, or tags match data/sql, or any of `read|write|edit|bash|glob|grep`. Writer/researcher therefore show as data-capable. Persist with `dataCapable` and no tools overwrites tools with `DEFAULT_DATA_TOOLS` (includes `bash`). Desktop toggle defaults on.

- Evidence: `crates/agent/src/team_ops.rs`, `crates/desktop-app/src/ui/chat_view.rs` (resource list)
- Fix: infer from dataset tools, not bash-only. Persist tools only when the operator sets them. Drop the name hardcode.

### TD-13 — High — Two create-agent postures

`spawn_agents` writes `tools: None` (`parse_tool_list` empty = all tools) and `inbox_enabled: false`. HQ persist defaults inbox on and a restricted tool list.

- Evidence: `crates/agent/src/tools/spawn_agent.rs`, `crates/agent/src/tools/delegate_to_agent.rs`
- Fix: route spawn through `persist_teammate`. Never treat `None` as unrestricted.

### TD-14 — High — WS can spend any stored profile; no size/injection scan

Client `profile_id` builds a live provider from disk secrets. REST chat scans body size + injection; WS and `sessions` message do not.

- Evidence: `crates/server/src/ws.rs`, `crates/server/src/routes/chat.rs`, `crates/server/src/routes/sessions.rs`
- Fix: drop client profile override or require HMAC. Apply the same 64KiB + injection scan as REST.

### TD-15 — High — Credentials file loses 0o600; config rewritten every start

`credentials.save_to_path` writes tmp + rename (umask 0644). `0o600` only on first `init`. `load_and_reconcile` rewrites `config.toml` every start (bakes env, copies external `data_dir` back into home, strips comments).

- Evidence: `crates/common/src/config.rs`, `crates/common/src/init.rs`
- Fix: `0o600` after every credentials write. Persist config only on explicit mutate. Never bake env.

### TD-16 — High — HMAC nonce consumed before verify

Nonce inserted into an uncapped map before signature check. Bad signature with a fresh timestamp still occupies the nonce.

- Evidence: `crates/security/src/auth_hmac.rs`
- Fix: verify first; cap nonce length and cache size.

### TD-17 — High — Asset sync can skip agents and stick a bad skill version

HTTP failure on agent templates is a silent skip. Skill sync can bump the manifest version even when GETs fail, so it never retries. `sha256_file` hashes empty on read error.

- Evidence: `crates/common/src/asset_sync.rs`
- Fix: fail or retry; bump version only if all downloads succeed; pin a release tag, not `main` HEAD.

### TD-18 — High — Inbox/kanban reset delegation depth

`delegate` caps depth at 3. Inbox and kanban start `delegation_depth: 0`. Inbox send to an inbox-enabled peer is Pending → A↔B loop.

- Evidence: `crates/agent/src/tools/delegate_to_agent.rs`, `crates/agent/src/inbox_dispatcher.rs`, `crates/agent/src/kanban_dispatcher.rs`
- Fix: persist hop count on inbox messages; refuse `from==to` or depth≥3; inherit depth in dispatchers.

### TD-19 — Medium — File write symlink escape; read denylist is filename-only

`file_write` uses lexical `starts_with`, no canonicalize of the final target. Read/bash denylist is `credentials.toml` / `.env` only.

- Evidence: `crates/agent/src/tools/file_write.rs`, `file_read.rs`, `bash.rs`
- Fix: canonicalize; deny `.ssh`, `*.bak`, symlink-out.

### TD-20 — Medium — Guardrail HTTP is disconnected

`PUT` trust mutates an unused registry. Policy add / approve return 501. Operator UI can “set Trusted” with no effect on the broker.

- Evidence: `crates/server/src/routes/guardrail.rs`
- Fix: wire or hide the endpoints.

### TD-21 — Medium — Inbox default and persist merge are inconsistent

New persist → `inbox_enabled: true`. Markdown parse missing field → `false`. Spawn → `false`. Empty `claim_tags` cannot clear. No upsert / spoof / concurrent-claim tests.

- Evidence: `crates/agent/src/team_ops.rs`, `crates/agent/src/agent_manager.rs`
- Fix: one default; always serialize `inbox_enabled`. Drive shipped fns in tests.

### TD-22 — Medium — Desktop HQ gaps

No delete/edit. Persist sheet dismisses on failure. List selection is a copied `TeamTeammate` (stale after refresh). CLI `agents get` reads `/runtime` for `name/emoji/id` (always `-`). Handoff response is snake_case; assign is camelCase.

- Evidence: `crates/desktop-app/src/ui/chat_view.rs` (resource list), `crates/desktop-app/src/store.rs`, `crates/cli/src/commands/agents.rs`
- Fix: GET-by-id; delete + edit; dismiss only on success; normalize both CLI names; one JSON case.

### TD-23 — Medium — `data-sources` is dead

Crate is not a workspace member. Data-analyst tools are bash/read/grep only — no SQL/KG.

- Evidence: `crates/data-sources/**`, `crates/common/src/agents/data-analyst.md`
- Fix: add to workspace and register, or delete.

### TD-24 — Medium — Migration `kind` lives in edited `001`

`conversations.kind` is in `001_init.sql` with no additive `013`. Existing DBs may checksum-fail or miss the column. `012` adds `agent_messages.state` correctly.

- Evidence: `crates/common/migrations/001_init.sql`, `crates/agent/src/conversation.rs`
- Fix: never edit applied 001; additive ALTERs only.

### TD-25 — Low — Misc contract holes

HMAC canonical path omits query. Dashboard `Secure` trusts raw `x-forwarded-proto`. `GET /api/messages?limit` is unbounded `i64`. `list_sessions` is N+1. DELETE `/api/agents/progress` can delete an agent named `progress`. CORS any method/header once origins are set. MCP `auth_header` returned unmasked on `GET /api/config`.

- Evidence: `crates/server/src/middleware.rs`, `crates/server/src/routes/messages.rs`, `sessions.rs`, `config.rs`
- Fix: clamp limits; redact secrets; do not accept foreign `main::*` conversation ids from the client.

## Deferred / rejected

| Item | Verdict |
|---|---|
| `List(selection: TeamTeammate?)` will not compile | Unverified. Possible on macOS with `.tag()`. Treat as UX risk inside TD-22, not a compile-fail. |
| Desktop `contains("AgentsView")` test is theater | Structural check required by the HQ plan. Keep. Add 502 / spoof / HMAC cases separately. |
| `/healthz` skips HMAC | Intended. |
| Bundled OAuth `CLIENT_ID` | Public client id, not a secret. |

## Unresolved

Same as [notes.md](./notes.md#unresolved).
