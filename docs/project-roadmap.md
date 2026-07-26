# Project Roadmap

## Project Overview

RushDino is a local-first AI agent platform providing a unified interface to multiple LLM providers and messaging channels. Current focus: robust gateway architecture for multi-channel message routing.

## Phases & Milestones

### Phase 1: Foundation (COMPLETE)
**Status:** Done
**Timeline:** Feb 2025

Core agent functionality and data persistence.

**Deliverables:**
- AgentEngine with conversation management
- SQLite integration for conversation history
- Provider abstraction (OpenAI, Anthropic, Ollama, Plugin)
- Native macOS app (SwiftUI/AppKit)
- CLI tool (init, start, stop, status, upgrade)

**Success Metrics:**
- Single-channel (web) chat working
- Conversations persist across restarts
- Multiple providers supported

---

### Phase 2: Multi-Channel Gateway (COMPLETE)
**Status:** Done
**Timeline:** Feb 2025

**Deliverables:**
- Gateway crate with ChannelAdapter trait
- Session management (SQLite-backed)
- Router for message flow (session → agent → reply)
- Telegram adapter (teloxide 0.13)
- Discord adapter (serenity 0.12)
- Slack adapter (Socket Mode)
- WebChat adapter (Axum WebSocket)
- Configuration system for enabling/disabling channels
- Unified message types (IncomingMessage, OutgoingMessage)

**Success Metrics:**
- All 4 channels tested and functional
- Session continuity across restarts
- Concurrent message handling
- No blocking operations in adapters

---

### Phase 3: Advanced Gateway Features (PLANNED)
**Status:** Not Started
**Timeline:** Future

Optional enhancements to gateway architecture.

**Potential Features:**
- Rich message support (embeds, attachments, images)
- Rate limiting per adapter
- Message queuing and retry logic
- Multi-room/group chat support
- Typing indicators and read receipts
- Custom event handling per adapter

---

### Phase 4: Knowledge Management (PLANNED)
**Status:** Not Started
**Timeline:** Future

Document ingestion and memory system.

**Deliverables:**
- Document upload/indexing
- Vector embeddings (local or cloud)
- RAG (Retrieval-Augmented Generation)
- Conversation memory system
- Memory filtering and pruning

**Success Metrics:**
- Documents searchable in conversations
- Agent retrieves relevant context
- Memory size manageable

---

### Phase 5: Production Hardening (PLANNED)
**Status:** Not Started
**Timeline:** Future

Reliability and performance optimization.

**Deliverables:**
- Error recovery and graceful degradation
- Performance profiling and optimization
- Load testing
- Security audit
- Comprehensive logging and monitoring
- Health checks and alerting

**Success Metrics:**
- 99.9% uptime in testing
- Sub-500ms response times
- Zero credential leaks in logs
- All OWASP top 10 addressed

---

## Current Focus

**Phase 2 (Multi-Channel Gateway)** implementation is complete:

✅ Gateway infrastructure (adapter trait, orchestrator, router)
✅ Session persistence (SQLite)
✅ Telegram channel (teloxide)
✅ Discord channel (serenity)
✅ Slack channel (Socket Mode)
✅ WebChat channel (Axum WebSocket)
✅ Configuration system
✅ Server integration

---

## High-Priority Future Work

1. **Testing & Validation**
   - Integration tests for each adapter
   - End-to-end gateway tests
   - Load testing (concurrent users, message rate)

2. **Rich Messages** (Phase 3)
   - Buttons, links, embeds for Discord/Slack
   - Image/media support
   - Code block rendering

3. **Knowledge Base** (Phase 4)
   - Document ingestion pipeline
   - Vector store integration
   - RAG query pipeline

4. **Monitoring & Ops** (Phase 5)
   - Structured logging (JSON)
   - Metrics collection (Prometheus)
   - Health check endpoints
   - Graceful shutdown handling

---

## Technical Debt & Known Issues

- **Message Types:** OutgoingMessage text-only; rich formatting blocked by type system
- **Session Management:** Simple channel_id + sender_id model; multi-room support requires redesign
- **Error Handling:** Some adapter failures logged but don't trigger alerts
- **Testing:** Limited integration test coverage; manual testing still primary

---

## Version History

### v0.1.0 (Current)
- Multi-channel gateway (Telegram, Discord, Slack, Web)
- Agent engine with provider abstraction
- SQLite persistence
- CLI tool
- Native SwiftUI macOS app

---

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Supported Channels | 4+ | 4 (Telegram, Discord, Slack, Web) |
| Message Latency | <500ms | TBD (not measured) |
| Session Persistence | 100% | ✓ (SQLite) |
| Error Recovery | Graceful | Partial (logs only) |
| Documentation | Complete | Good (architecture, codebase) |
| Test Coverage | 70%+ | Low (needs improvement) |

---

## Dependencies & Blockers

**Phase 3 blockers:**
- None (optional enhancements)

**Phase 4 blockers:**
- Vector store selection (local vs cloud)
- Embedding model choice

**Phase 5 blockers:**
- Security audit results
- Performance baseline establishment

---

## Next Steps

1. **Immediate (this sprint):**
   - Complete integration tests for gateway
   - Performance baseline testing
   - Documentation review

2. **Short-term (1-2 weeks):**
   - Phase 3 design review (rich messages)
   - Identify test gaps
   - Profiling and optimization

3. **Medium-term (1 month):**
   - Begin Phase 4 prototype (knowledge base)
   - Security audit planning
   - Monitoring setup

---

## Stakeholder Contact

Project lead: See repository maintainers

For questions or contributions, refer to CLAUDE.md and development-rules.md for workflow guidelines.
