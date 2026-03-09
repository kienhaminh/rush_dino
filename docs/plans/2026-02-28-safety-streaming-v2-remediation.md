# Safety + Streaming V2 Remediation Plan

## Summary

This plan replaces the previous safety/streaming plan with a compile-safe and security-correct implementation that addresses:

1. Safe Codex token refresh persistence (no string rewrite hacks).
2. WebSocket streaming without duplicate final-turn LLM calls.
3. Session-scoped approval gate with strict request ownership.
4. Frontend WS protocol updates without regressing existing message types.
5. Workspace-level test/build verification.

## Implemented Scope

- Codex startup refresh with explicit fallback provider support.
- `CredentialsConfig::save_to_path` with atomic write semantics.
- Direct websocket streaming path (`engine.stream_chat_via_ws`) with typed events.
- Dangerous-only `shell_exec` approval flow.
- Session-bound approval gate with timeout, deny-on-disconnect, and owner enforcement.
- Frontend approval cards, typed websocket events, and backward-compatible chunk parsing.

## Key Interfaces Added/Changed

- `AppConfig.codex_fallback_provider: Option<ProviderKind>`
- `CredentialsConfig::save_to_path(&Path) -> Result<()>`
- `rushdino_providers::codex_refresh::{token_needs_refresh, refresh_codex_token}`
- `rushdino_agent::ToolApproval`, `ToolApprovalRequest`
- `rushdino_agent::engine::WsStreamEvent`
- Frontend types:
  - `WsServerEvent` union
  - `ApprovalPromptItem`
  - `TimelineItem`

## Verification

Commands run:

```bash
cargo check --workspace
cargo test --workspace
cd frontend && npm run build
```

Results:

- Rust workspace compiles successfully.
- Rust tests pass (with existing ignored e2e placeholder unchanged).
- Frontend production build succeeds.

## Notes

- Approval policy defaults to dangerous-command-only checks in `shell_exec`.
- If active provider is Codex and refresh fails, fallback requires explicit `codex_fallback_provider` and valid credentials/config for that provider.
- Web-only approval/session semantics do not alter Telegram/Discord/Slack gateway flow.
