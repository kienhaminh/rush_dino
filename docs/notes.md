# Notes

Current-system operator notes. Not a changelog. Update in place.

**Last updated:** 2026-08-18

## Local team HQ (shipped 2026-08-18)

Operator can persist / list / assign / handoff named teammates on this machine. No VM. Runtime stays in-process `rushdino-server` (`~/.rushdino`).

| Action | Path |
|---|---|
| Persist teammate | `POST /api/agents` → `team_ops::persist_teammate` → `AgentManager::save` |
| List team | `GET /api/agents` |
| Assign work | `POST /api/agents/:id/assign` — inbox `operator → agent` + user message on conversation `{agent_id}` |
| Handoff | `POST /api/agents/:id/handoff` — inbox sender → receiver |
| Desktop HQ | Workspace → Agents (`AgentsView`), not raw JSON inspector |
| CLI | `rushdino agents create\|assign\|handoff\|list` |

Assign does **not** start an LLM run. Inbox dispatcher picks it up if `inbox_enabled`. Chat / Telegram / Discord / Slack still hit the default engine only.

Data-capable badge is inferred (`data-analyst`, claim tags `data|sql|…`, or tools `read|write|edit|bash|glob|grep`). Persist with `dataCapable: true` and no tools writes `DEFAULT_DATA_TOOLS` (includes `bash`).

## Audit 2026-08-18

Six parallel reviewers (security, agent runtime, HTTP, desktop/CLI, gateway, shared infra). Criticals verified on source before accepting.

**What is true today**

- Sandbox / doctor “on” does not confine `LocalSystemBroker` — host `sh -c`.
- Dangerous shell auto-approves when the approval session is missing (gateway + inbox). Substring `.rushdino` skips the gate.
- Channel conversations are `main::{channel}` (shared). Groups skip pairing. Slack DMs have no pairing.
- Disk-only HQ (`list`/`persist`/`assign`) still requires `state.engine()?`. Empty `default_profile_id` → 502. Confirmed on isolated launch.
- HMAC + dashboard auth default off. Template bind `127.0.0.1`; `AppConfig::default()` is `0.0.0.0`.
- Assign / kanban / delegate share conversation id = agent name. Inbox replies use a different UUID.
- Handoff `from` is client-supplied; `from: "operator"` always accepted.
- CLI does not sign HMAC. Desktop does.
- Chat/WS has `profile_id` only — no `agent_id`.
- `data-sources` crate is not a workspace member; data-analyst cannot query SQL/KG.

Register and fix order: [tech_debt.md](./tech_debt.md).

## Unresolved

- Have existing operator DBs applied a `001` that already has `conversations.kind`? Need `_sqlx_migrations` dump.
- Is `main::{channel}` an intentional single-household bot? Even then, untrusted group members must not share that transcript.
- Is the host meant to be LAN / Telegram-public? Defaults disagree (template localhost vs Default `0.0.0.0` + Telegram on).
- Is `data_capable` a UX badge or an authorization bit? Code treats it as both.
