# RushDino Desktop

RushDino Desktop is a native desktop app built with Rust + [GPUI Component](https://longbridge.github.io/gpui-component/)
(GPU-accelerated UI, 60+ shadcn-style components). It bundles the existing Rust
runtime as a `rushdino-server` helper process; no WebView, Swift toolchain, or
Node runtime is involved.

## Structure

```text
crates/desktop-app/
├── Resources/
│   ├── AppIcon.png
│   └── Info.plist
└── src/
    ├── main.rs             # App entry: GPUI application + window bootstrap
    ├── backend_process.rs  # Spawns/supervises the bundled rushdino-server
    ├── signer.rs           # HMAC-SHA256 request signing
    ├── api_client.rs       # Signed HTTP client (reqwest)
    ├── chat_socket.rs      # /api/ws/chat WebSocket client (tokio-tungstenite)
    ├── daemon.rs           # Tokio-thread daemon bridging backend ⇄ UI channels
    ├── models.rs           # Serde models + JSON display helpers
    ├── store.rs            # AppStore entity: all app state + event handling
    └── ui/                 # GPUI views
        ├── mod.rs          # AppView root (title bar, sidebar, detail) + event pump
        ├── sidebar_view.rs # Navigation sidebar (Sidebar/SidebarMenu)
        ├── chat_view.rs         # Message list, resource lists, kanban columns
        ├── composer_view.rs     # Composer entity (InputState + send button)
        ├── approval_card.rs     # Tool approval cards
        ├── input_request_view.rs# Input-request summary cards
        ├── search_view.rs       # Conversation search screen
        └── settings_view.rs     # Settings screen (status, models, channels, privacy)

## Runtime boundary

`backend_process.rs` starts the bundled `rushdino-server` on a free loopback
port and stops the owned process on exit. Bind/auth overrides are transient, so
launching the app never rewrites the shared CLI configuration. Each launch
creates an in-memory HMAC secret shared only with the owned helper; every HTTP
and WebSocket request is signed.

The daemon runs on a dedicated Tokio runtime thread and communicates with the
UI through two unbounded channels (`Command` in, `UiEvent` out). The UI-side
event pump lives in `ui/mod.rs` and updates the `AppStore` entity.

The Rust agent runtime remains the source of truth. The desktop crate owns only
presentation, local process lifecycle, and request signing.

## Build, run

```bash
./script/build_and_run.sh          # build debug bundle + run
./script/build_and_run.sh --verify # build, open, assert process alive
RUSHDINO_BUILD_CONFIGURATION=release ./script/build_and_run.sh build
```

The script compiles both cargo packages, stages `dist/RushDino.app`, embeds
the server under `Contents/Resources`, adds an ad-hoc signature, and opens the
bundle.

## Feature surfaces

- Streaming chat with conversation history (WebSocket chunks → live message list)
- Tool approval requests (approve/deny inline)
- Structured input requests (displayed as summary cards in v1)
- Sidebar navigation over workspace sections: agents, sessions, workflows,
  knowledge graph, approvals, logs, automations, kanban (generic resource
  lists; kanban renders grouped by board column)
- Search screen filtering conversations by title and jumping to one
- Settings screen: runtime status plus JSON panes for models (`/api/profiles`),
  channels (`/api/gateway/adapters`), and privacy (`/api/config` security)

## Requirements

- macOS 10.15+ (Metal Toolchain via Xcode required for gpui shader compilation:
  `xcodebuild -downloadComponent MetalToolchain`)
- Linux/Windows supported by gpui-component (not yet packaged here)
- Rust stable
