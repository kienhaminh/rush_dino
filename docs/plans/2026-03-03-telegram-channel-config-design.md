# Telegram Channel Config Design

**Date:** 2026-03-03
**Status:** Approved

## Problem

The Gateway section only exposes a single enable/disable toggle per channel. Telegram requires two additional fields to be useful: a bot token and an allowed-chat-IDs access filter. Users currently must hand-edit TOML files to configure these.

## Approach

Extend the Gateway section UI to show a detail panel inline beneath the Telegram toggle when it is enabled. Telegram is the first channel to use this pattern; Discord and Slack can follow the same structure in future.

No backend struct changes are needed — the relevant fields already exist:
- `CredentialsConfig.telegram_bot_token` — bot token (secret)
- `AppConfig.allowed_chat_ids: Vec<i64>` — access filter (top-level field)

## UI Layout

```
[ Telegram                    ● (toggle on) ]
  ┌──────────────────────────────────────┐
  │ Bot Token         [●●●●●●●●●●●●●●●] │  password input ("***" when set)
  │ Allowed Chat IDs  [            ] [+] │  integer input + Add button
  │                   [12345] [67890] ×  │  removable chip tags
  └──────────────────────────────────────┘

[ Discord                     ○ (toggle off) ]
[ Slack                        ○             ]
[ WebChat                      ● (toggle on)  ]
```

The detail panel collapses when the toggle is turned off.

## Data Flow

- **Bot token** read/written via `CredentialsView.telegram_bot_token` — the Gateway section receives `credentials` + `onCredentialsChange` props from `ConfigPage`, same as the Credentials section already does.
- **Allowed chat IDs** read/written via `AppConfigView.allowed_chat_ids` — the chip input adds/removes integers from that array, saved through `patchConfig` on Save.

## Validation

- Allowed chat ID input: only enable Add when the input is a valid integer. Show inline hint on invalid input.
- Bot token: same `***` placeholder behaviour as Credentials section.

## Components Changed

| File | Change |
|---|---|
| `frontend/src/lib/types.ts` | Add `allowed_chat_ids: number[]` to `AppConfigView` |
| `frontend/src/pages/config/config-section-gateway.tsx` | Add `credentials` + `onCredentialsChange` props; render Telegram detail panel |
| `frontend/src/pages/config/ConfigPage.tsx` | Pass `credentials` + `onCredentialsChange` to `ConfigSectionGateway` |

No new files required.
