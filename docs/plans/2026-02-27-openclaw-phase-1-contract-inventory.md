# Phase 1A: OpenClaw Contract Inventory

## Purpose

Capture the concrete migration surface for Phase 1 ("contract freeze") so Rust implementation work can target explicit parity contracts.

## Snapshot

- Source analyzed: `openclaw/`
- Date: 2026-02-27
- Language footprint:
  - TypeScript: ~4,777 files
  - Swift: ~518 files
  - Rust: 0 files

## Current Rust Workspace Target

Existing destination crates:

- `crates/common`
- `crates/gateway`
- `crates/server`
- `crates/agent`
- `crates/providers`
- `crates/cli`
- `crates/extensions/telegram`
- `crates/extensions/discord`
- `crates/extensions/slack`

## Core Source Area Sizing (OpenClaw `src/*`)

Approximate TypeScript file counts:

| Area | TS files |
|---|---:|
| `agents` | 683 |
| `infra` | 325 |
| `commands` | 319 |
| `gateway` | 296 |
| `cli` | 259 |
| `auto-reply` | 248 |
| `config` | 199 |
| `channels` | 145 |
| `discord` | 128 |
| `browser` | 122 |
| `telegram` | 103 |
| `slack` | 92 |
| `memory` | 84 |
| `web` | 80 |
| `cron` | 75 |
| `plugins` | 64 |

## Gateway Server-Methods Surface

Detected non-test files in `openclaw/src/gateway/server-methods`:

- `agent-job.ts`
- `agent-timestamp.ts`
- `agent.ts`
- `agents.ts`
- `attachment-normalize.ts`
- `base-hash.ts`
- `browser.ts`
- `channels.ts`
- `chat-transcript-inject.ts`
- `chat.test-helpers.ts`
- `chat.ts`
- `config.ts`
- `connect.ts`
- `cron.ts`
- `devices.ts`
- `doctor.ts`
- `exec-approval.ts`
- `exec-approvals.ts`
- `health.ts`
- `logs.ts`
- `models.ts`
- `nodes.handlers.invoke-result.ts`
- `nodes.helpers.ts`
- `nodes.ts`
- `push.ts`
- `restart-request.ts`
- `secrets.ts`
- `send.ts`
- `sessions.ts`
- `skills.ts`
- `system.ts`
- `talk.ts`
- `tools-catalog.ts`
- `tts.ts`
- `types.ts`
- `update.ts`
- `usage.ts`
- `validation.ts`
- `voicewake.ts`
- `web.ts`
- `wizard.ts`

This list is the baseline API/control-plane contract surface to map into Rust endpoints and shared protocol types.

## Config Contract Density

`openclaw/src/config` currently contains:

- 35 `types.*.ts` files
- 9 `schema.*.ts` files
- 19 `zod-schema.*.ts` files

This indicates a wide configuration contract that must be migrated as a first-class schema package, not ad-hoc fields.

## Channel and Extension Surfaces

### In `openclaw/src/channels`

- `allowlists`
- `plugins`
- `telegram`
- `web`

### In `openclaw/extensions`

- `acpx`
- `bluebubbles`
- `copilot-proxy`
- `device-pair`
- `diagnostics-otel`
- `discord`
- `feishu`
- `google-gemini-cli-auth`
- `googlechat`
- `imessage`
- `irc`
- `line`
- `llm-task`
- `lobster`
- `matrix`
- `mattermost`
- `memory-core`
- `memory-lancedb`
- `minimax-portal-auth`
- `msteams`
- `nextcloud-talk`
- `nostr`
- `open-prose`
- `phone-control`
- `qwen-portal-auth`
- `shared`
- `signal`
- `slack`
- `synology-chat`
- `talk-voice`
- `telegram`
- `test-utils`
- `thread-ownership`
- `tlon`
- `twitch`
- `voice-call`
- `whatsapp`
- `zalo`
- `zalouser`

## Initial Rust Mapping (Phase 1 Guidance)

- Gateway/control-plane contracts:
  - OpenClaw `src/gateway/server-methods/*` -> RushDino `crates/server` + `crates/gateway`
- Config/types/schema:
  - OpenClaw `src/config/*` -> RushDino `crates/common`
- Agent/provider/tool execution:
  - OpenClaw `src/agents/*`, `src/providers/*` -> RushDino `crates/agent`, `crates/providers`
- CLI behavior:
  - OpenClaw `src/cli/*`, `src/commands/*` -> RushDino `crates/cli`
- Core channels:
  - OpenClaw Telegram/Discord/Slack/Web -> RushDino adapter crates + server webchat

## Phase 1B Next Actions

1. Create Rust protocol contract definitions for gateway method envelopes and errors.
2. Add parity fixture harness under workspace tests (`tests/parity/*`) for method-level request/response fixtures.
3. Freeze minimal config schema set needed for gateway+agent boot path.
4. Implement a "parity matrix" file tracking each OpenClaw method/config item to Rust implementation status.
