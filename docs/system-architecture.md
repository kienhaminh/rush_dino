# System Architecture

## Overview

RushDino is a local-first AI agent platform built in Rust. The system is organized around a **multi-channel gateway** that abstracts different messaging platforms (Telegram, Discord, Slack, Web) into a unified message routing layer.

## High-Level Flow

```
┌──────────────┐  ┌──────────┐  ┌────────┐  ┌────────┐
│  Telegram    │  │ Discord  │  │ Slack  │  │ WebChat│
│  (teloxide)  │  │(serenity)│  │(Socket)│  │ (axum) │
└──────┬───────┘  └─────┬────┘  └────┬───┘  └────┬───┘
       │                │           │          │
       └────────────────┴───────────┴──────────┘
                        │
                   IncomingMessage
                        │
            ╔═══════════▼════════════╗
            ║   Multi-Channel       ║
            ║   Gateway (mpsc)      ║
            ║                       ║
            ║ ┌─────────────────┐   ║
            ║ │ Router:         │   ║
            ║ │ - Session lookup│   ║
            ║ │ - Agent routing │   ║
            ║ │ - Reply dispatch│   ║
            ║ └─────────────────┘   ║
            ╚═════════╤══════════════╝
                      │
          ┌───────────┴───────────┐
          │                       │
    ┌─────▼────────┐     ┌───────▼──────┐
    │ Agent Engine │     │  SQLite DB   │
    │ (chat/agent) │     │(sessions,    │
    └──────────────┘     │conversations)│
          │              └──────────────┘
          │
    ┌─────▼────────┐
    │  Providers   │
    │ (OpenAI/     │
    │  Ollama/etc) │
    └──────────────┘
```

## Gateway Architecture

The gateway decouples messaging platforms from the core agent logic through a trait-based adapter pattern.

### Core Components

#### 1. ChannelAdapter Trait (`crates/gateway/src/adapter.rs`)

Every messaging platform implements the `ChannelAdapter` trait:

```rust
#[async_trait]
pub trait ChannelAdapter: Send + Sync + 'static {
    fn channel_id(&self) -> &str;
    async fn start(&self, tx: mpsc::Sender<IncomingMessage>) -> Result<()>;
    async fn send_message(&self, recipient: &str, msg: OutgoingMessage) -> Result<()>;
}
```

- **channel_id**: Unique platform identifier ("telegram", "discord", "slack", "webchat")
- **start()**: Launches platform listener, pushes `IncomingMessage` objects onto shared mpsc channel
- **send_message()**: Delivers response back to specific user/channel

#### 2. Gateway Orchestrator (`crates/gateway/src/gateway.rs`)

The `Gateway` struct registers adapters and manages their lifecycle:

```rust
pub struct Gateway {
    adapters: Vec<Arc<dyn ChannelAdapter>>,
    engine: Arc<AgentEngine>,
    pool: SqlitePool,
}
```

**Responsibilities:**
- Accepts adapter registration via `register()` or `register_arc()`
- Spawns each adapter in a dedicated tokio task on `start()`
- Wires adapters to Router via mpsc channel
- Owns database connection pool

#### 3. Router (`crates/gateway/src/router.rs`)

Routes messages from all adapters through session management and agent logic:

**Message Flow:**
1. Receive `IncomingMessage` from adapter-to-gateway mpsc channel
2. Look up or create session via `SessionManager` (channel_id + sender_id)
3. Call `AgentEngine::chat()` with conversation_id + user text
4. Extract response and look up originating adapter
5. Send `OutgoingMessage` via adapter's `send_message()`

Each message routes concurrently in its own tokio task.

#### 4. SessionManager (`crates/gateway/src/session.rs`)

Persists user sessions to SQLite:

- **Key**: (channel_id, sender_id) pair uniquely identifies a user across platforms
- **Value**: conversation_id (UUID) linked to AgentEngine conversation history
- **Persistence**: Survives server restarts; resumed on reconnect

#### 5. Message Types (`crates/gateway/src/message.rs`)

```rust
pub struct IncomingMessage {
    pub channel_id: String,      // "telegram", "discord", etc.
    pub sender_id: String,       // Platform-specific user/chat ID
    pub text: String,            // User message content
    pub timestamp: DateTime<Utc>,
}

pub struct OutgoingMessage {
    pub text: String,            // Agent response
}
```

## Channel Adapters

### Telegram (`crates/extensions/telegram`)

**Implementation:** `TelegramAdapter: ChannelAdapter`
**Library:** teloxide 0.13
**Transport:** Long polling or webhook
**Unique ID:** chat_id

- Wraps existing teloxide handler
- Converts Telegram update messages to `IncomingMessage`
- Sends responses via Telegram API

### Discord (`crates/extensions/discord`)

**Implementation:** `DiscordAdapter: ChannelAdapter`
**Library:** serenity 0.12
**Transport:** Discord WebSocket gateway
**Unique ID:** user_id or channel_id

- Listens on Discord gateway for message events
- Handles slash commands and direct messages
- Sends replies to appropriate Discord channels/users

### Slack (`crates/extensions/slack`)

**Implementation:** `SlackAdapter: ChannelAdapter`
**Library:** reqwest + tokio-tungstenite
**Transport:** Socket Mode WebSocket
**Unique ID:** user_id or channel_id

- Establishes WebSocket connection via Socket Mode
- Receives events (messages, app_mentions)
- Sends responses via Slack Web API

### WebChat (`crates/server/src/webchat.rs`)

**Implementation:** `WebChatAdapter: ChannelAdapter`
**Transport:** Axum WebSocket (HTTP → WS)
**Unique ID:** socket_id (UUID)

- Implements bidirectional WebSocket adapter
- Integrates with Axum server for browser connections
- Session ties browser client to agent conversation
- WebSocket route: `/api/ws/chat` → router → agent → broadcast

## Database Schema

### Conversations Table
Used by AgentEngine to store chat history.

### Gateway Sessions Table (Migration 002)
Tracks session mappings:

```
CREATE TABLE gateway_sessions (
    id TEXT PRIMARY KEY,           -- UUID
    channel_id TEXT NOT NULL,      -- "telegram", "discord", etc.
    sender_id TEXT NOT NULL,       -- Platform user ID
    conversation_id TEXT NOT NULL, -- Links to conversations table
    created_at TIMESTAMP,
    UNIQUE(channel_id, sender_id)
);
```

## Configuration

### AppConfig (`crates/common`)

```toml
[gateway]
[gateway.telegram]
enabled = true

[gateway.discord]
enabled = true

[gateway.slack]
enabled = true

[gateway.webchat]
enabled = true
```

### CredentialsConfig

```toml
telegram_bot_token = "..."
discord_bot_token = "..."
slack_bot_token = "..."
slack_app_token = "..."
```

## Server Integration

In `crates/server/src/lib.rs`:

1. Create `Gateway` instance with `AgentEngine` and SQLite pool
2. Register enabled adapters based on config:
   - Telegram (if token present)
   - Discord (if token present)
   - Slack (if both tokens present)
   - WebChat (always on)
3. Spawn gateway in background task via `tokio::spawn()`
4. WebSocket route (`/api/ws/chat`) connects new browser clients to `WebChatAdapter`

## Error Handling

- Adapter errors logged but don't crash gateway
- Session errors logged; message dropped
- Agent errors logged; generic error message sent to user
- Send errors logged per adapter

## Concurrency Model

- **Gateway**: Single orchestrator task spawning all adapters
- **Adapters**: Each adapter runs in dedicated tokio task
- **Router**: Concurrent message processing; each message routed in separate task
- **Channels**: mpsc bounded channel (buffer size 128) for adapter → router flow

## Extension Points

### Adding a New Channel

1. Create new crate: `crates/{platform}`
2. Implement `ChannelAdapter` trait
3. Register in `server/lib.rs` based on config flag
4. Add credentials to `CredentialsConfig` if needed
5. Add enabled flag to `GatewayConfig`

### Custom Message Types

Extend `IncomingMessage` with metadata (attachments, etc.) as needed; keep `OutgoingMessage` simple (text-first).

## Known Limitations

- Outgoing messages text-only (no rich formatting, media)
- SessionManager uses channel_id + sender_id; complex multi-room scenarios require enhancement
- No message queuing or retry logic per adapter
