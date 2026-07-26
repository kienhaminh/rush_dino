# RushDino Desktop

RushDino Desktop is a native macOS 26 app built with SwiftUI and AppKit. It
uses the existing Rust runtime through a bundled `rushdino-server` helper
process; no WebView, React runtime, Node toolchain, or Tauri host is involved.

## Structure

```text
crates/desktop-app/
├── Package.swift
├── Resources/
│   ├── AppIcon.png
│   └── Info.plist
├── Sources/RushDino/
│   ├── App/
│   ├── Models/
│   ├── Services/
│   ├── Stores/
│   ├── Support/
│   └── Views/
└── Tests/RushDinoTests/
```

The primary scene is a `WindowGroup` with a native `NavigationSplitView`.
Settings are a separate macOS `Settings` scene. The sidebar, toolbar, search,
lists, inspectors, menus, and keyboard shortcuts use system SwiftUI controls.
The composer is the only custom Liquid Glass surface.

## Runtime boundary

`BackendProcessController` starts the bundled `rushdino-server` on an available
loopback port and stops the owned process when the app exits. Bind/auth
overrides are transient, so launching the app never rewrites the shared CLI
configuration. Each launch creates an in-memory HMAC secret shared only with
the owned helper, and every native HTTP/WebSocket request is signed. The native client
uses:

- `URLSession` for HTTP APIs
- `URLSessionWebSocketTask` for `/api/ws/chat`
- the shared `~/.rushdino/` configuration, credentials, database, agents, and
  skills used by the CLI

The Rust agent runtime remains the source of truth. Swift owns only macOS
presentation, local process lifecycle, and platform integration.

## Build, run, and test

```bash
./script/build_and_run.sh
./script/build_and_run.sh --verify
swift test --package-path crates/desktop-app
```

The build script compiles `rushdino-server`, builds the Swift executable,
stages `dist/RushDino.app`, embeds the server under `Contents/Resources`, adds
an ad-hoc development signature, and opens the app as a foreground macOS
bundle.

For a release bundle:

```bash
scripts/build-desktop-app.sh
```

If `APPLE_SIGNING_IDENTITY` and `APPLE_NOTARY_PROFILE` are configured, the
release script signs and notarizes `dist/RushDino.app`.

## Native feature surfaces

- Streaming chat and conversation history
- Conversation search
- Automations with pause, resume, and run-now actions
- Kanban board
- Agents, sessions, workflows, knowledge graph, approvals, and logs
- Dedicated General, Appearance, Models, Channels, and Privacy settings
- Native menus and keyboard shortcuts

## Requirements

- macOS 26
- Xcode 26 / Swift 6.2
- Rust stable
