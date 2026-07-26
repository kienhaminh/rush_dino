# Code Standards & Guidelines

## Rust Project Standards

### File Organization

**Naming Convention:**
- Modules/files: `snake_case` (e.g., `message.rs`, `session.rs`)
- Crates: `kebab-case` with descriptive names (e.g., `rushdino-gateway`)
- File size limit: Keep under 200 LOC; split larger files into modules

**Module Structure:**
```rust
// In src/lib.rs — export public API only
pub mod adapter;
pub mod gateway;
pub mod message;

pub use adapter::ChannelAdapter;
pub use gateway::Gateway;
pub use message::{IncomingMessage, OutgoingMessage};
```

### Type Definitions

**Error Handling:**
- All fallible operations return `Result<T>` (from `rushdino_common::Result`)
- Define custom errors in each crate's `error.rs` when needed
- Use `AppError` enum for common application errors

**Trait Design:**
- Use `#[async_trait]` for async trait methods
- Mark traits `Send + Sync + 'static` for cross-task usage
- Prefer trait objects (`Arc<dyn Trait>`) for registry patterns

**Message Types:**
- Minimize type variants; use composition over inheritance
- Keep message types serializable (`serde`)
- Add timestamp for audit trails

### Async/Concurrency

**Tokio Usage:**
- Spawn long-running tasks with `tokio::spawn()`
- Use `mpsc` channels for work distribution
- Set reasonable buffer sizes (128 typical for gateways)
- Never block in async code (use `tokio::task::block_in_place` if unavoidable)

**Error Handling in Async:**
- Log adapter errors; don't crash gateway
- Drop failed messages rather than queuing indefinitely
- Use `tokio::select!` for timeout patterns

### Configuration

**Config Loading:**
- Use `figment` for config file parsing (TOML)
- Environment variable overrides supported
- Validate required fields at startup
- Credentials stored separately from config

**Patterns:**
```rust
// In config.rs
#[derive(Serialize, Deserialize)]
pub struct AppConfig {
    pub gateway: GatewayConfig,
    pub db_path: PathBuf,
    // ...
}

// In credentials.rs
#[derive(Serialize, Deserialize)]
pub struct CredentialsConfig {
    pub telegram_bot_token: Option<String>,
    // ...
}
```

### Database (SQLx)

**Migrations:**
- Store in `crates/common/migrations/`
- Name format: `NNN_description.sql` (001, 002, etc.)
- One semantic change per migration
- Use IF NOT EXISTS for idempotency

**Queries:**
- Use `sqlx` macros for compile-time checking
- Parameterize all user input
- Handle NULL and type conversions explicitly
- Use transactions for multi-step operations

### Testing

**Unit Tests:**
- Place in `tests/` submodule or same file
- Name tests `test_<functionality>`
- Test happy path and error cases
- Mock external dependencies when possible

**Integration Tests:**
- Place in `crates/*/tests/` directory
- Test adapter → gateway → agent flow
- Use real SQLite (in-memory for speed)
- Clean up resources after tests

**Running Tests:**
```bash
cargo test --workspace
cargo test --lib                    # Unit only
cargo test --test '*'              # Integration only
cargo test -- --test-threads=1     # Serial execution
```

### Documentation

**Code Comments:**
- Document public APIs with `///` doc comments
- Explain *why*, not *what* (code shows what)
- Example usage in doc comments for complex types

**README Standards:**
- Each crate has `README.md` or equivalent in docs
- Describe purpose and key types
- Show usage examples

### Logging

**Tracing Usage:**
- Use `tracing::{info, warn, error, debug}` macros
- Include context (adapter name, conversation ID, etc.)
- Avoid logging sensitive data (API keys, tokens)

**Patterns:**
```rust
tracing::info!("gateway: telegram adapter registered");
tracing::error!("adapter '{}' exited with error: {}", channel_id, err);
tracing::warn!("gateway: discord enabled but token missing");
```

---

## Architecture Patterns

### Gateway Pattern

**ChannelAdapter Trait:**
1. Implement `channel_id()` — return unique platform identifier
2. Implement `start()` — begin listening, push messages onto mpsc sender
3. Implement `send_message()` — deliver response to specific user

**Registration Pattern:**
```rust
let mut gateway = Gateway::new(engine, pool);
gateway.register(TelegramAdapter::new(token, config));
gateway.register_arc(Arc::new(WebChatAdapter::new()));
tokio::spawn(gateway.start());
```

### Message Flow Pattern

```
Adapter → IncomingMessage
  ↓
Gateway (mpsc channel)
  ↓
Router: session lookup + agent call
  ↓
Adapter.send_message(OutgoingMessage)
```

### Session Management Pattern

```rust
// In router
let conversation_id = session_manager
    .get_or_create(&msg.channel_id, &msg.sender_id)
    .await?;

// Returns same UUID for same (channel, sender) pair
// Persisted to gateway_sessions table
```

---

## Crate-Specific Standards

### Gateway Crate (`crates/gateway`)

**Public API Exports:**
```rust
pub use adapter::ChannelAdapter;
pub use gateway::Gateway;
pub use message::{IncomingMessage, OutgoingMessage};
pub use router::Router;
pub use session::SessionManager;
```

**Internal Modules:**
- Never re-export `gateway::Gateway::new()` internals
- Session persistence is internal detail
- Router concurrency model opaque to users

### Adapter Crates (Telegram, Discord, Slack, WebChat)

**Naming Conventions:**
- Struct: `<Platform>Adapter` (e.g., `DiscordAdapter`)
- File: `src/lib.rs` (single-file crates typical)
- Imports: `impl ChannelAdapter for DiscordAdapter`

**Lifecycle:**
- `new()` initializes configuration only
- `start()` blocks until adapter stops (or error)
- `send_message()` enqueues response (non-blocking)

### Server Crate (`crates/server`)

**Organization:**
```
src/
├── lib.rs          # run_server() entry point, gateway wiring
├── state.rs        # AppState definition
├── ws.rs           # WebSocket upgrade handler
├── webchat.rs      # WebChatAdapter implementation
├── routes/         # HTTP endpoint handlers
│   ├── mod.rs
│   ├── chat.rs
│   ├── conversations.rs
│   ├── documents.rs
│   └── health.rs
├── middleware/     # Request middleware
└── webchat.rs      # WebChat gateway adapter
```

**State Management:**
- `AppState` owns `engine`, `config`, and `webchat`
- Cloned per-request (Arc reference counting)
- No mutable state; all mutations via channels

---

## Dependency Management

**Workspace Dependencies:**
- Declare in `Cargo.toml` [workspace.dependencies]
- Enables version consistency across crates
- Update workspace deps, not individual crates

**Feature Flags:**
- Minimal features enabled by default
- Optional features for large dependencies
- Document feature implications

**Dependency Review:**
- Prefer async-compatible libraries (tokio ecosystem)
- Check license compatibility (MIT preferred)
- Evaluate maintenance status before adding

---

## Security Guidelines

### Credentials Handling

**DO:**
- Store in `CredentialsConfig` (file-based, user-writable)
- Load from TOML with restricted permissions
- Pass to adapters as immutable references
- Log presence, not values

**DON'T:**
- Embed in config files
- Log token values
- Pass via query strings
- Store in database (except as hash if needed)

### Input Validation

**Message Content:**
- Accept user text as-is (don't validate content)
- Enforce length limits if needed
- Trim whitespace for cleanliness

**Adapter Parameters:**
- Validate platform IDs match expected format
- Sanitize for platform-specific constraints
- Use platform validation where available

---

## Performance Considerations

### Concurrency Tuning

**Channel Buffer Size:**
- Default: 128 for gateway mpsc
- Increase if messages pile up (check tracing logs)
- Monitor memory usage if buffer large

**Task Spawning:**
- One task per adapter
- One task per router message
- Expected scale: 100s-1000s concurrent users per instance

### Database Optimization

**Connection Pooling:**
- SQLx pool acquired at server startup
- Reused across all adapters
- Pool size scales with expected concurrency

**Query Patterns:**
- Use indexes on (channel_id, sender_id) for session lookups
- Batch updates when possible
- Archive old conversations periodically

---

## Code Review Checklist

Before submitting PR:

- [ ] Code compiles without warnings (`cargo check`)
- [ ] Tests pass (`cargo test`)
- [ ] Follows naming conventions (snake_case, kebab-case)
- [ ] Error handling present (no `.unwrap()` in library code)
- [ ] Logging appropriate (debug/info/warn/error used correctly)
- [ ] No sensitive data logged
- [ ] No `TODO` comments without issue reference
- [ ] Comments explain "why", not "what"
- [ ] File size <200 LOC (split if larger)
- [ ] Public API documented with `///` comments

---

## Maintenance

### Version Bumping

- Patch: Bug fixes, internal refactors
- Minor: New features, new adapters
- Major: Breaking API changes

### Changelog

- Update `docs/project-roadmap.md` with phase progress
- Document breaking changes in migration guide
- Credit contributors

### Deprecation

- Mark deprecated code with `#[deprecated]` attribute
- Document migration path
- Maintain for 2 releases before removal
