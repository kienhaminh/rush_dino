# RushDino: Project Overview & Product Development Requirements

## Executive Summary

**RushDino** is a local-first AI agent platform that provides a unified interface for interacting with multiple LLM providers across diverse messaging channels. The system is built in Rust for performance and reliability, with a focus on gateway architecture enabling seamless multi-channel message routing.

**Current Version:** 0.1.0
**Status:** Production-ready gateway with 4 messaging channels (Telegram, Discord, Slack, Web)

---

## Product Vision

### Problem Statement

Users want to interact with AI agents across their preferred messaging platforms without rebuilding the same agent logic for each channel. Current solutions require either:
1. Separate bot implementations per channel (maintenance nightmare)
2. Cloud-dependent integration platforms (privacy and cost concerns)
3. Monolithic applications with tightly coupled channel logic

### Solution

RushDino provides a clean abstraction layer (Gateway) that decouples channel adapters from core agent logic, enabling:
- **Write once, support everywhere:** Single `AgentEngine`, multiple channels
- **Local-first:** Self-hosted, no cloud dependencies
- **Extensible:** Plugin architecture for new channels and providers
- **Scalable:** Concurrent message handling via Rust async/concurrency

---

## Functional Requirements

### 1. Multi-Channel Messaging

**FR1.1:** Support multiple messaging platforms
- **Telegram:** Via teloxide library (long polling or webhook)
- **Discord:** Via serenity library (gateway WebSocket)
- **Slack:** Via Socket Mode (WebSocket)
- **Web:** Via Axum WebSocket (browser clients)
- **Extensible:** New channels via `ChannelAdapter` trait

**FR1.2:** Unified message types
- All channels use `IncomingMessage` and `OutgoingMessage`
- Platform-specific translation at adapter boundaries
- Timestamp and sender tracking

**FR1.3:** Session continuity
- Per-user sessions linked to conversation history
- Sessions survive server restarts
- One conversation per (channel, user) pair

### 2. AI Agent Engine

**FR2.1:** Conversation management
- Multi-turn conversations with history
- Per-conversation context persistence
- Configurable agent behavior

**FR2.2:** Provider abstraction
- Support multiple LLM backends:
  - OpenAI (GPT-3.5, GPT-4)
  - Anthropic (Claude)
  - Ollama (local models)
  - Custom plugin system
- Fallback support if primary provider unavailable
- Streaming responses for better UX

**FR2.3:** Memory and knowledge
- Store conversation history in SQLite
- Markdown-based memory files (`~/.rushdino/memory/`)
- Future: RAG with document ingestion

### 3. Data Persistence

**FR3.1:** SQLite database
- Conversation storage (multi-turn history)
- Session mappings (channel → conversation)
- Configurable data directory (`~/.rushdino/`)

**FR3.2:** Configuration management
- TOML-based config files
- Per-user credentials (token/API keys)
- Environment variable overrides
- Channel-by-channel enablement toggles

### 4. User Interface

**FR4.1:** Web UI
- React/TypeScript frontend
- Real-time WebSocket chat
- Conversation history browser
- Responsive design

**FR4.2:** CLI
- Initialize config and database
- Start/stop/restart server
- Check status
- Self-update capability

### 5. Extensibility

**FR5.1:** New channels
- Implement `ChannelAdapter` trait (3 methods)
- Register in config
- No changes to core logic needed

**FR5.2:** New providers
- Implement provider trait
- Add configuration and credentials
- Seamless fallback on error

---

## Non-Functional Requirements

### 1. Performance

**NFR1.1:** Message latency
- Target: <500ms end-to-end (user message → agent response → user)
- Includes LLM provider delay
- Concurrent message processing (no blocking)

**NFR1.2:** Concurrency
- Support 100+ concurrent conversations
- Handle message spikes (100+ msg/sec)
- Bounded message queue (prevent memory unbounded growth)

**NFR1.3:** Memory efficiency
- Single server instance <500MB RAM baseline
- Linear growth with conversation count
- Garbage collection of old conversations (future)

### 2. Reliability

**NFR2.1:** Error recovery
- Adapter failures don't crash gateway
- Session data survives restarts
- Graceful shutdown (finish in-flight messages)
- No message loss (messages logged if delivery fails)

**NFR2.2:** Data integrity
- SQLite ACID transactions
- Migration support for schema changes
- Backup strategy (user-controlled)

**NFR2.3:** Availability
- Target: 99.9% uptime (excluding planned restarts)
- Health check endpoint
- No single points of failure

### 3. Security

**NFR3.1:** Credential protection
- Separate credentials file (not in git)
- Restricted file permissions
- No tokens in logs
- No sensitive data in database

**NFR3.2:** Input validation
- Sanitize platform-specific IDs
- Length limits on messages
- Rate limiting per adapter (future)

**NFR3.3:** Network security
- TLS for external API calls (forced via rustls)
- No plaintext token transmission
- Validate SSL certificates

### 4. Maintainability

**NFR4.1:** Code quality
- Modular architecture (file size <200 LOC)
- Clear separation of concerns
- Comprehensive error handling
- Documentation for public APIs

**NFR4.2:** Testing
- Unit tests for core logic
- Integration tests for adapters
- CI/CD via GitHub Actions (future)

**NFR4.3:** Observability
- Structured logging (tracing)
- Log levels: debug, info, warn, error
- Contextual information (adapter, conversation ID)
- No debugging needed for common issues

### 5. Compatibility

**NFR5.1:** Platform support
- Linux (primary)
- macOS (tested)
- Windows (untested, likely works)

**NFR5.2:** Rust version
- MSRV: 1.70 (or latest stable)
- No nightly features required

**NFR5.3:** Dependency stability
- Stable crates only (no 0.x in workspace)
- Regular security updates
- Minimal transitive dependencies

---

## Architecture Decisions

### 1. Rust Implementation

**Rationale:**
- Performance (no GC pauses)
- Memory safety (prevent crashes)
- Async-friendly ecosystem (tokio, axum)
- Static typing catches bugs early
- Single-binary deployment

### 2. Gateway Pattern

**Rationale:**
- Clear separation: adapters ⟷ core logic
- Extensibility: new channels without modifying engine
- Testability: mock adapters easily
- Scalability: adapter failures isolated

### 3. SQLite (not Postgres)

**Rationale:**
- Self-hosted: no external database needed
- Simple deployment: single file
- Sufficient for single-instance use case
- Can upgrade to Postgres if needed (compatible SQL)

### 4. Axum Web Framework

**Rationale:**
- Minimal overhead (tower layer system)
- Async-first design
- Type-safe routing
- Excellent middleware ecosystem

### 5. Trait-Based Adapters

**Rationale:**
- Compile-time verification of adapter contract
- Dynamic dispatch for registry pattern
- Easy to test (implement mock adapter)
- Decouples platforms from gateway

---

## Technical Constraints

### 1. Connectivity
- Assumes internet access (for external LLM APIs)
- Local Ollama support for air-gapped deployments
- WebSocket for real-time browser communication

### 2. Storage
- Single SQLite database per instance
- No distributed deployment support (planned for future)
- User must manage backups

### 3. Scalability
- Single-process design (multi-process via orchestration, e.g., systemd)
- Vertical scaling only (hardware upgrades)
- Horizontal scaling future work (would need shared database)

### 4. Rate Limiting
- None built-in (assumed external load balancer)
- Adapter-specific limits at API level (Discord rate limits, etc.)

---

## Success Criteria

### Phase 1 (Foundation) — COMPLETE

- [x] Single-channel (web) chat operational
- [x] Conversation persistence working
- [x] Multiple providers supported (OpenAI, Anthropic, Ollama)
- [x] CLI tool (init, start, stop, status)
- [x] React web UI functional
- [x] Documentation complete

### Phase 2 (Multi-Channel Gateway) — COMPLETE

- [x] Gateway crate with ChannelAdapter trait
- [x] Telegram adapter (teloxide)
- [x] Discord adapter (serenity)
- [x] Slack adapter (Socket Mode)
- [x] WebChat adapter (Axum)
- [x] Session management (SQLite)
- [x] Configuration system (enable/disable channels)
- [x] All 4 channels tested and working
- [x] Concurrent message handling verified
- [x] Session continuity across restarts confirmed

### Phase 3+ (Future Features)

- [ ] Rich message support (embeds, media)
- [ ] Document ingestion & RAG
- [ ] Advanced memory (vector embeddings)
- [ ] Monitoring & alerting
- [ ] Multi-instance deployment

---

## Key Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| LLM API outage | Medium | High | Local Ollama fallback, user-facing error messages |
| Adapter library updates breaking | Low | Medium | Version pinning, integration tests, migration guide |
| Session data corruption | Low | High | SQLite ACID transactions, regular backups |
| Message loss due to crash | Low | Medium | Message retry logic (future), persistent queue (future) |
| Credential compromise | Low | Critical | File-based storage, no logging, secure access patterns |

---

## Competitive Landscape

**Alternatives:**
1. **Cloud services** (e.g., Make.com, Zapier): Expensive, privacy concerns, vendor lock-in
2. **Bot per platform:** Duplicated logic, high maintenance
3. **Commercial platforms:** Cost, feature bloat
4. **Open-source competitors:** Similar scope; RushDino differentiates on Rust performance and clean architecture

**RushDino Advantage:**
- Self-hosted (privacy)
- Unified interface (easy to extend)
- Performance (Rust, async)
- Lean codebase (maintainable)

---

## Dependencies & Integrations

### External Services

1. **LLM Providers**
   - OpenAI API (GPT-3.5, GPT-4)
   - Anthropic API (Claude)
   - Ollama (local)
   - Custom plugins

2. **Messaging Platforms**
   - Telegram Bot API
   - Discord API
   - Slack Web API + Socket Mode
   - WebSocket (own servers)

3. **Optional Services**
   - Brave Search API (for agent internet access)
   - Vector databases (future)

### Library Dependencies

- **Core:** tokio, axum, sqlx, serde, chrono
- **Platforms:** teloxide, serenity, reqwest, tokio-tungstenite
- **DevOps:** tracing, clap, figment

---

## Deployment Model

### Current (v0.1.0)

- Single-binary deployment
- Systemd service (Linux) or manual process manager
- Config directory: `~/.rushdino/`
- Database: `~/.rushdino/db.sqlite`
- No docker yet (planned)

### Future

- Docker/container support
- Multi-instance with load balancer
- Kubernetes-ready
- Managed database (Postgres)

---

## Maintenance & Support

### Update Strategy

- Semantic versioning (major.minor.patch)
- `cargo update` for dependency updates
- `rushdino upgrade` CLI command

### Backward Compatibility

- Database migrations support (sqlx)
- Config format stability
- API stability (breaking changes → major version)

### Deprecation Policy

- Mark deprecated features with `#[deprecated]`
- Provide 2 releases for migration
- Detailed migration guides

---

## Success Metrics (OKRs)

**Q1 2025:**
- [ ] Phase 2 (Gateway) complete and tested
- [ ] Documentation coverage >90%
- [ ] 5+ external users testing

**Q2 2025:**
- [ ] Phase 3 (Rich messages) complete
- [ ] Performance baseline <300ms latency
- [ ] Test coverage >70%

**Q3 2025:**
- [ ] Phase 4 (Knowledge base) prototype
- [ ] Production-grade monitoring
- [ ] 50+ active users

---

## Conclusion

RushDino provides a solid foundation for local-first AI agent deployment across multiple channels. The clean gateway architecture enables rapid feature development and seamless extension. Current focus: hardening Phase 2 implementation and establishing production operations readiness.

**Next milestone:** Phase 3 design review (rich messages) and performance optimization.
