# Codebase Summary

## Project Structure

RushDino is organized as a Rust workspace with specialized crates handling different concerns.

```
RushDino/
├── crates/
│   ├── common/        # Shared types, config, database
│   ├── providers/     # LLM provider integrations
│   ├── agent/         # Core agent engine
│   ├── gateway/       # Multi-channel message gateway
│   ├── server/        # Axum HTTP server + WebSocket
│   ├── telegram/      # Telegram channel adapter
│   ├── discord/       # Discord channel adapter
│   ├── slack/         # Slack channel adapter
│   └── cli/           # Command-line interface
├── frontend/          # React/TypeScript web UI
├── docs/              # Documentation (this directory)
└── scripts/           # Build and utility scripts
```

## Crates Overview

### `crates/common`

**Purpose:** Shared types, configuration, database utilities

**Key Files:**
- `src/config.rs` — `AppConfig` (gateway, provider settings), `GatewayConfig`, `ChannelConfig`
- `src/credentials.rs` — `CredentialsConfig` (API keys, bot tokens)
- `src/db.rs` — SQLite pool initialization, migration runner
- `src/error.rs` — `AppError` enum (includes `MigrateError`)
- `src/migrations/` — SQL migrations (001: base schema, 002: gateway_sessions table)

**Changes:** Added `GatewayConfig` with channel toggles; added bot token fields to `CredentialsConfig`; added migration 002.

### `crates/providers`

**Purpose:** LLM provider abstraction and implementations

**Providers:** OpenAI, Anthropic, Ollama, Plugin-based

**Key Interface:**
- `Provider` trait for streaming responses
- `ProviderConfig` enum for different backends

### `crates/agent`

**Purpose:** Core agent logic, conversation management

**Key Components:**
- `AgentEngine` — Main orchestrator
- `AgentConfig` — Agent tuning parameters
- Conversation storage (SQLite via AgentEngine)

**Public API:**
```rust
impl AgentEngine {
    pub async fn chat(&self, conversation_id: &str, text: &str) -> Result<ChatResponse>;
}
```

### `crates/gateway` — NEW

**Purpose:** Multi-channel message routing and session management

**Key Files:**
- `src/adapter.rs` — `ChannelAdapter` trait (define contract for all channels)
- `src/gateway.rs` — `Gateway` orchestrator (register adapters, spawn tasks)
- `src/router.rs` — `Router` (message routing logic)
- `src/session.rs` — `SessionManager` (SQLite-backed session persistence)
- `src/message.rs` — `IncomingMessage`, `OutgoingMessage` types
- `src/lib.rs` — Public API exports

**Core Types:**
```rust
#[async_trait]
pub trait ChannelAdapter: Send + Sync + 'static {
    fn channel_id(&self) -> &str;
    async fn start(&self, tx: mpsc::Sender<IncomingMessage>) -> Result<()>;
    async fn send_message(&self, recipient: &str, msg: OutgoingMessage) -> Result<()>;
}

pub struct IncomingMessage {
    pub channel_id: String,
    pub sender_id: String,
    pub text: String,
    pub timestamp: DateTime<Utc>,
}

pub struct OutgoingMessage {
    pub text: String,
}
```

### `crates/server`

**Purpose:** HTTP API server, WebSocket handling, app state

**Key Files:**
- `src/lib.rs` — Server initialization, gateway wiring
- `src/state.rs` — `AppState` (engine, config, webchat adapter)
- `src/routes/` — HTTP endpoints (chat, conversations, documents, health)
- `src/ws.rs` — WebSocket upgrade handler
- `src/webchat.rs` — `WebChatAdapter: ChannelAdapter` implementation
- `src/middleware/` — CORS, tracing
- `src/static_files.rs` — Serve frontend assets

**Gateway Integration:**
1. Gateway instantiated with `engine` and database pool
2. Adapters registered conditionally (Telegram, Discord, Slack, WebChat)
3. Gateway spawned in background task
4. WebSocket route wired to `WebChatAdapter` sender channel

### `crates/telegram` — MODIFIED

**Purpose:** Telegram channel integration

**Key Files:**
- `src/lib.rs` — `TelegramAdapter: ChannelAdapter` implementation
- Uses teloxide 0.13 for Telegram Bot API
- Converts teloxide updates to `IncomingMessage`
- Sends responses via Telegram API

### `crates/discord` — NEW

**Purpose:** Discord channel integration

**Key Files:**
- `src/lib.rs` — `DiscordAdapter: ChannelAdapter` implementation
- Uses serenity 0.12 for Discord API
- Listens on Discord gateway WebSocket
- Routes messages and responses through Discord

### `crates/slack` — NEW

**Purpose:** Slack channel integration

**Key Files:**
- `src/lib.rs` — `SlackAdapter: ChannelAdapter` implementation
- Uses Socket Mode (reqwest + tokio-tungstenite)
- Receives events via WebSocket
- Sends responses via Slack Web API

### `crates/cli`

**Purpose:** Command-line interface

**Commands:**
- `rushdino init` — Initialize config
- `rushdino start [--foreground]` — Start server
- `rushdino stop` — Stop server
- `rushdino status` — Check status
- `rushdino upgrade` — Self-update

## Key Files by Concern

### Configuration & Credentials
- `crates/common/src/config.rs` — `AppConfig`, `GatewayConfig`
- `crates/common/src/credentials.rs` — Bot tokens, API keys

### Gateway Architecture
- `crates/gateway/src/adapter.rs` — Trait definition
- `crates/gateway/src/gateway.rs` — Orchestrator
- `crates/gateway/src/router.rs` — Message routing
- `crates/gateway/src/session.rs` — Session persistence

### Channel Adapters
- `crates/telegram/src/lib.rs` — Telegram
- `crates/discord/src/lib.rs` — Discord
- `crates/slack/src/lib.rs` — Slack
- `crates/server/src/webchat.rs` — Web chat

### Server & HTTP
- `crates/server/src/lib.rs` — Server setup
- `crates/server/src/ws.rs` — WebSocket handler
- `crates/server/src/state.rs` — App state

### Database
- `crates/common/src/db.rs` — Pool, migrations
- `crates/common/migrations/` — SQL schemas

## Dependencies

### Messaging
- **teloxide** 0.13 — Telegram Bot API
- **serenity** 0.12 — Discord API
- **tokio-tungstenite** — WebSocket client
- **reqwest** 0.12 — HTTP client

### Web Server
- **axum** 0.7 — HTTP framework
- **tokio** 1 — Async runtime
- **tower-http** 0.5 — Middleware (CORS, tracing)

### Database
- **sqlx** 0.8 — Async SQL with compile-time checks
- **chrono** 0.4 — Datetime handling

### AI Providers
- **async-openai** 0.24 — OpenAI
- **reqwest** 0.12 — HTTP for custom providers

### Utilities
- **serde**, **serde_json** — Serialization
- **uuid** 1 — Session/conversation IDs
- **tracing**, **tracing-subscriber** — Structured logging
- **figment** 0.10 — Configuration loading
- **clap** 4.5 — CLI argument parsing

## Build & Development

### Check & Test
```bash
cargo check --workspace
cargo test --workspace
```

### Build Release
```bash
./scripts/build-release.sh
```

### Frontend Development
```bash
cd frontend && npm install && npm run dev
```

## Recent Changes (v0.1.0)

### New Crates Added
- `crates/gateway/` — Multi-channel gateway (adapter trait, orchestrator, router, session manager)
- `crates/discord/` — Discord adapter with serenity
- `crates/slack/` — Slack Socket Mode adapter

### Files Modified
- `crates/common/src/config.rs` — Added `GatewayConfig`, `ChannelConfig`
- `crates/common/src/credentials.rs` — Added `discord_bot_token`, `slack_bot_token`, `slack_app_token`
- `crates/common/src/error.rs` — Added `MigrateError` variant
- `crates/common/migrations/002_gateway_sessions.sql` — New migration for session persistence
- `crates/telegram/src/lib.rs` — Implements `ChannelAdapter` trait
- `crates/server/src/lib.rs` — Gateway initialization and adapter registration
- `crates/server/src/state.rs` — Added `webchat: Arc<WebChatAdapter>`
- `crates/server/src/webchat.rs` — New `WebChatAdapter` implementing `ChannelAdapter`

## Database Migrations

### Migration 001
- `conversations` table (AgentEngine owned)
- `jobs` table (future feature)

### Migration 002 (NEW)
- `gateway_sessions` table:
  - Unique (channel_id, sender_id) → conversation_id mapping
  - Enables cross-platform session continuity
  - Survives server restarts

## Testing

Unit tests for each crate verify:
- Adapter trait contract
- Router message flow
- Session persistence
- Configuration loading

Run tests with:
```bash
cargo test --workspace
```
