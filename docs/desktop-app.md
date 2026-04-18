# RushDino Desktop

Native macOS desktop app for RushDino. Built on **Tauri 2 + React**, with the
existing Rust backend (`rushdino-server`, `rushdino-agent`, providers, ACP,
gateway, knowledge-graph, security) embedded **in-process** inside the same
Tauri binary. Design language: **"Obsidian & Copper"** — real macOS vibrancy
plus CSS glassmorphism, a serif display face (Fraunces), a humanist grotesque
body (Host Grotesk), and mono accents (JetBrains Mono pending a swap to Commit
Mono).

> **One-line pitch:** a local, glass-and-copper workbench for the agents you
> actually ship with.

---

## Layout

```
crates/desktop-app/
├── src-tauri/                 # Tauri 2 Rust host process
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   ├── icons/                 # .png placeholders (copied from repo logo.png)
│   └── src/
│       ├── main.rs            # thin entry → lib.rs::run
│       ├── lib.rs             # builder, vibrancy, global hotkey, shutdown
│       ├── server_runtime.rs  # embeds rushdino_server::build_app
│       ├── commands.rs        # #[tauri::command]s (keychain, notify, etc.)
│       ├── keychain.rs        # macOS Keychain via `keyring`
│       └── window.rs          # NSVisualEffectMaterial::UnderWindowBackground
└── ui/                        # new React app (not forked from frontend/)
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── design/            # tokens.css, typography.css — Obsidian & Copper
        ├── components/
        │   ├── shell/         # AppShell, TitleBar, LeftRail, StatusRibbon, RightInspector
        │   ├── glass/         # GlassPanel, IridescentLine, GrainOverlay
        │   └── command-palette/  # cmdk-backed ⌘K palette
        ├── api/               # typed fetch clients per feature area
        ├── hooks/             # useChatStream (WS), etc.
        └── pages/             # one .tsx per route
```

## Architecture at a glance

- **One process.** No subprocess, no PID tracking. The Tauri main spawns a
  tokio runtime and calls `rushdino_server::build_app()`. The embedded server
  binds to a **random free loopback port** (not the CLI's 28847, so both can
  run side-by-side). Graceful shutdown fires on `RunEvent::ExitRequested`.
- **Home dir shared with the CLI** at `~/.rushdino/` — same `config.toml`,
  `credentials.toml`, `db.sqlite`. A user running `rushdino start` and the
  desktop app sees one source of truth.
- **CORS.** The desktop process mutates its in-memory `AppConfig` before
  passing it to `build_app`, appending `tauri://localhost`,
  `http://tauri.localhost`, `http://127.0.0.1:1420`, and
  `http://localhost:1420` to `security.allowed_origins`. The CLI path is
  untouched.
- **UI → server.** The React UI calls `invoke('get_server_port')` once and
  caches the result (`src/api/bootstrap.ts`). Every feature's typed fetch
  client goes through `apiFetch(path, init)`. WebSocket chat streaming uses
  the same origin at `/api/ws/chat`.
- **Native capabilities.** Keychain access (`keychain_set/get/delete`),
  file dialogs, notifications, updater checks, global shortcuts, window-state
  persistence. Plugins registered in `lib.rs::run`.

## Feature coverage

| Route              | State                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| `/` (Chat)         | ✅ WS streaming via `/api/ws/chat`; prose/workbench toggle; tool-call cards; markdown |
| `/sessions`        | ✅ timeline list from `/api/agent-sessions`                                           |
| `/agents`          | ✅ grid of agent cards from `/api/agents`                                             |
| `/coding-agents`   | 🟨 placeholder — `routes::acp` exists but manager isn't wired on `AppState`            |
| `/workflows`       | ✅ list from `/api/workflows`                                                         |
| `/skills`          | ✅ list from `/api/skills` with built-in badges                                       |
| `/knowledge-graph` | ✅ stats + facts + backfill                                                           |
| `/channels`        | ✅ adapter list + restart (`/api/gateway/adapters`)                                   |
| `/providers`       | ✅ profile grid from `/api/profiles`                                                  |
| `/config`          | ✅ summary + credentials editor (`PATCH /api/credentials`) + raw JSON viewer          |
| `/cron`            | ✅ list + pause/resume/run-now                                                        |
| `/approvals`       | ✅ polling inbox + approve/deny                                                       |
| `/metrics`         | ✅ totals + by-provider / by-model / by-day breakdowns                                |
| `/logs`            | ✅ live tail with level filter + pause/resume                                         |
| `/guardrail`       | ✅ read-only posture cards                                                            |

## Dev workflow

Prerequisites:

- Rust stable (≥ 1.70).
- Node 22+ with pnpm.
- `cargo install tauri-cli --version '^2' --locked` (one-time).

```bash
# From the repo root:
cd crates/desktop-app/src-tauri
cargo tauri dev
```

This runs `pnpm --dir ../ui dev` on port 1420 and launches the Tauri window.
The window materialises instantly with macOS vibrancy; the boot choreography
(rail slide → hairline sweep → panel frost-bloom → ribbon rise) fires once.

**Typecheck / lint / build the UI standalone:**

```bash
cd crates/desktop-app/ui
pnpm typecheck          # tsc --noEmit
pnpm build              # tsc && vite build → dist/
```

**Rust-only check:**

```bash
cargo check -p rushdino-desktop
```

**Release bundle:**

```bash
scripts/build-desktop-app.sh            # defaults to universal-apple-darwin
TAURI_TARGET=aarch64-apple-darwin scripts/build-desktop-app.sh
```

Artifacts land in `target/<target>/release/bundle/{macos,dmg}/`.

## Design language quick reference

| Token                         | Usage                                                        |
| ----------------------------- | ------------------------------------------------------------ |
| `--night-{0,1,2,3}`           | obsidian backgrounds, darkest → lightest                     |
| `--ice-{100,400,600}`         | text primary / secondary / tertiary                          |
| `--copper-{300,500,700}`      | hover / primary accent / pressed                             |
| `--ember / --viridian / --lithium` | destructive / success / warning signals                 |
| `--glass-tint`                | 4% copper tint behind every `GlassPanel`                     |
| `--glass-highlight`           | 1px inner-top stroke — the "light catches the top" secret    |
| `--iridescent`                | copper→magenta→teal→gold gradient for hairlines only (4 surfaces max) |

- Serif numerals (`.metric-numeral`) with `font-feature-settings: 'tnum' 1`
  appear on stat cards, session durations on hover, etc.
- The **one memorable gesture** is the coordinated boot reveal on first paint.
  If it ever stops feeling "expensive" — that's a regression.
- Banned: Inter, Roboto, Arial, Space Grotesk, Tailwind default palette.

## Global hotkey

`⌘⇧Space` summons the command palette from anywhere on the system. Rust-side
registration is in `lib.rs::run`; the JS side listens on the `palette:toggle`
event and mirrors the in-window `⌘K` state.

## Release pipeline (Phase F)

### One-time setup

1. **Apple Developer ID cert.** Request "Developer ID Application" from
   developer.apple.com, install the .cer into Keychain Access. Take note
   of the full identity string:
   ```bash
   security find-identity -v -p codesigning
   # Look for the "Developer ID Application: Your Name (TEAMID)" line
   ```

2. **Notarytool keychain profile.** One-time stash of an Apple ID +
   app-specific password so CI / scripts don't have to type creds:
   ```bash
   xcrun notarytool store-credentials rushdino-notary \
     --apple-id YOU@example.com \
     --team-id  TEAMID \
     --password APP-SPECIFIC-PASSWORD
   ```

3. **Updater keypair.** Generate once; the private key is CI-only, the
   public key is embedded in the app:
   ```bash
   scripts/desktop-updater-keygen.sh
   ```
   Paste the printed pubkey into
   `crates/desktop-app/src-tauri/tauri.conf.json` at
   `plugins.updater.pubkey` and flip `plugins.updater.active` to true.

4. **Universal target.** On Apple Silicon:
   ```bash
   rustup target add aarch64-apple-darwin x86_64-apple-darwin
   ```

### Release flow

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_NOTARY_PROFILE="rushdino-notary"
# if you used an updater-key passphrase, also:
# export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="..."

scripts/build-desktop-app.sh
```

That single script:

1. Builds the React UI (`pnpm build`).
2. Builds the universal Tauri binary
   (`cargo tauri build --target universal-apple-darwin`).
3. When both `APPLE_SIGNING_IDENTITY` and `APPLE_NOTARY_PROFILE` are set,
   hands the output to `scripts/sign-and-notarize.sh` which:
   - `codesign --force --deep --options runtime --timestamp` on the .app
   - `codesign` on the .dmg
   - `xcrun notarytool submit … --wait` for both
   - `xcrun stapler staple` to embed the ticket
   - `spctl -a -vvv -t install` to verify Gatekeeper accepts it

Artifacts land at
`crates/desktop-app/src-tauri/target/universal-apple-darwin/release/bundle/{macos,dmg}/`.
Ship the `.dmg` — users drag-to-Applications and Gatekeeper opens it
first-click (no right-click-Open prompt).

### Auto-update

- The Tauri Updater plugin (`tauri-plugin-updater`) is already registered
  in `lib.rs`. It polls `plugins.updater.endpoints[]` for a JSON manifest
  signed with the pubkey from keygen.
- Endpoint URL is a placeholder
  (`https://releases.rushdino.ai/desktop/{{target}}/{{current_version}}/latest.json`).
  Point it at a real host (GitHub Releases redirect, S3+CloudFront,
  tauri-update-server, etc.) before shipping.
- The `check_for_updates` Tauri command in
  `src-tauri/src/commands.rs` is already wired into React via
  `invoke('check_for_updates')` — call it from a Settings button or
  on-launch poll once the endpoint exists.

## Still to do (tracked against the original plan)

- **ACP wiring.** `crates/server/src/routes/acp.rs` exists but
  `AppState.acp_manager` isn't populated anywhere — the `rushdino-acp` crate
  isn't a dep of `rushdino-server`. Restoring the integration unlocks the
  `/coding-agents` page.
- **Typography.** Swap JetBrains Mono → Commit Mono once the font files are
  self-hosted under `ui/src/assets/fonts/`. Keep the CDN link as a fallback.
- **WS chat polish.** Approval and `input_request` events currently surface
  as an error banner; build the approve/deny + input-reply UI inline.
- **Real icons.** `icons/32x32.png` etc. are currently repo `logo.png`
  duplicates. Generate a proper `icon.icns` from a 1024×1024 master via
  `iconutil` before `cargo tauri build`.
- **Signing + notarization.** `scripts/sign-and-notarize.sh` is the planned
  entry point; not yet implemented. Needs a Developer ID cert in the keychain
  and `xcrun notarytool store-credentials` run once.
- **Auto-update host.** `plugins.updater.endpoints` in `tauri.conf.json`
  points at `releases.rushdino.ai` as a placeholder. Pick a real host
  (GitHub Releases vs self-hosted S3) before the first signed build.
- **Tray / menubar popover.** Not yet wired. Plan calls for a quick-chat
  popover — low priority vs. the above.

## Retiring the old desktop-native crate

`crates/desktop-native/` (the egui scaffold, 2/14 tabs implemented) is already
excluded from the workspace via `Cargo.toml` `[workspace] exclude`. Delete the
directory and `scripts/build-desktop-native.sh` once you're confident the new
Tauri app is the only desktop surface.
