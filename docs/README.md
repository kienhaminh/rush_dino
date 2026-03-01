# RushDino Documentation

Welcome to the RushDino project documentation. This directory contains comprehensive guides for understanding, developing, and deploying RushDino.

## Quick Navigation

### For Architects & Designers
Start here to understand the overall system design:

1. **[Project Overview & PDR](./project-overview-pdr.md)** — Vision, requirements, and strategic decisions
2. **[System Architecture](./system-architecture.md)** — Technical deep-dive into gateway, adapters, and message flow
3. **[Project Roadmap](./project-roadmap.md)** — Phases, milestones, and future direction

### For Developers
Essential guides for writing code and contributing:

1. **[Code Standards](./code-standards.md)** — Coding conventions, patterns, and best practices
2. **[Codebase Summary](./codebase-summary.md)** — Crate organization, key files, and recent changes
3. **[System Architecture](./system-architecture.md)** — Understanding the gateway and adapter system

## Document Overview

| Document | Purpose | Audience | Length |
|----------|---------|----------|--------|
| **project-overview-pdr.md** | Vision, requirements, and strategy | Architects, PMs | 428 lines |
| **system-architecture.md** | Technical architecture and design patterns | Architects, senior developers | 261 lines |
| **codebase-summary.md** | Crate organization and file structure | All developers | 271 lines |
| **code-standards.md** | Coding rules, patterns, and best practices | All developers | 355 lines |
| **project-roadmap.md** | Development phases and progress tracking | All stakeholders | 221 lines |

## Key Topics

### Gateway Architecture

RushDino uses a **multi-channel gateway** that abstracts messaging platforms (Telegram, Discord, Slack, Web) into a unified message routing system.

- **Learn the basics:** [System Architecture](./system-architecture.md#gateway-architecture)
- **Extend with new channel:** [System Architecture - Extension Points](./system-architecture.md#extension-points)
- **Implement adapter:** [Code Standards - Gateway Crate](./code-standards.md#gateway-crate-cratesgateway)

### Project Structure

```
crates/
├── common/      # Shared config, database, types
├── providers/   # LLM integrations (OpenAI, Anthropic, Ollama, etc.)
├── agent/       # Core agent engine
├── gateway/     # Multi-channel gateway (NEW)
├── server/      # HTTP/WebSocket server
├── telegram/    # Telegram adapter (MODIFIED)
├── discord/     # Discord adapter (NEW)
├── slack/       # Slack adapter (NEW)
└── cli/         # Command-line interface
```

Details: [Codebase Summary](./codebase-summary.md#crates-overview)

### Getting Started

1. **First time?** Read [System Architecture Overview](./system-architecture.md#overview) (5 min read)
2. **Setting up locally?** See [Code Standards - Testing](./code-standards.md#testing) section
3. **Adding a new feature?** Check [Project Roadmap - Next Steps](./project-roadmap.md#next-steps)
4. **Implementing an adapter?** Review [Code Standards - Adapter Crates](./code-standards.md#adapter-crates-telegram-discord-slack-webchat)

### Common Workflows

#### I want to add a new messaging channel

1. Understand the adapter pattern: [System Architecture - ChannelAdapter Trait](./system-architecture.md#1-channeladapter-trait)
2. Follow the standards: [Code Standards - Adding a New Channel](./code-standards.md#adding-a-new-channel)
3. Review examples: [Codebase Summary - Channel Adapters](./codebase-summary.md#channel-adapters)

#### I want to understand the message flow

1. Start with high-level diagram: [System Architecture - High-Level Flow](./system-architecture.md#high-level-flow)
2. Deep-dive into components: [System Architecture - Gateway Architecture](./system-architecture.md#gateway-architecture)
3. Trace through code: [Codebase Summary - Key Files by Concern](./codebase-summary.md#key-files-by-concern)

#### I want to understand the codebase structure

1. Overview: [Codebase Summary - Project Structure](./codebase-summary.md#project-structure)
2. Per-crate details: [Codebase Summary - Crates Overview](./codebase-summary.md#crates-overview)
3. File locations: [Codebase Summary - Key Files by Concern](./codebase-summary.md#key-files-by-concern)

#### I want to check code quality standards

1. General standards: [Code Standards - Rust Project Standards](./code-standards.md#rust-project-standards)
2. Crate-specific: [Code Standards - Crate-Specific Standards](./code-standards.md#crate-specific-standards)
3. Pre-commit checklist: [Code Standards - Code Review Checklist](./code-standards.md#code-review-checklist)

#### I want to understand the roadmap

1. Phase overview: [Project Roadmap - Phases & Milestones](./project-roadmap.md#phases--milestones)
2. Current focus: [Project Roadmap - Current Focus](./project-roadmap.md#current-focus)
3. Next steps: [Project Roadmap - Next Steps](./project-roadmap.md#next-steps)

## Version Information

**Current Version:** 0.1.0
**Status:** Multi-channel gateway implemented and operational
**Last Updated:** February 27, 2026

## Recent Changes

### Phase 2: Multi-Channel Gateway (Complete)

New in this release:
- ✓ `crates/gateway` — Multi-channel message routing
- ✓ `crates/extensions/discord` — Discord adapter (serenity)
- ✓ `crates/extensions/slack` — Slack adapter (Socket Mode)
- ✓ Telegram adapter upgraded to use ChannelAdapter trait
- ✓ WebChat adapter for browser connections
- ✓ SessionManager for persistent session tracking
- ✓ Configuration system for channel enablement

See [Codebase Summary - Recent Changes](./codebase-summary.md#recent-changes-v010) for detailed list.

### Safety + Streaming Remediation (2026-02-28)

- Codex startup now attempts OAuth token refresh and persists refreshed credentials safely.
- If Codex refresh fails, the server can use `codex_fallback_provider` from `config.toml` when that provider is correctly configured.
- WebSocket chat now streams direct engine chunks with typed events (`chat_chunk`, `assistant_reset`, `approval_request`, `approval_result`, `error`).
- Dangerous `shell_exec` commands now require per-session approval in the web UI.

## Documentation Development

Documentation is maintained alongside code. See [Project Overview - Maintenance & Support](./project-overview-pdr.md#maintenance--support) for update policies.

### Future Documentation Planned

- [ ] Deployment Guide (Docker, systemd, cloud)
- [ ] API Reference (HTTP endpoints, WebSocket format)
- [ ] Troubleshooting Guide (common issues)
- [ ] Security Hardening Guide
- [ ] Adapter Development Tutorial
- [ ] Performance Tuning Guide

## Contributing to Documentation

Follow these guidelines:

1. Keep files under 500 lines (split large topics)
2. Use clear headers and table of contents
3. Include examples and code snippets
4. Cross-reference related sections
5. Verify technical accuracy against codebase
6. Use Markdown formatting consistently

## Questions or Feedback?

- **Architecture questions:** See [System Architecture](./system-architecture.md)
- **Development questions:** See [Code Standards](./code-standards.md)
- **Project direction:** See [Project Roadmap](./project-roadmap.md) and [Project Overview](./project-overview-pdr.md)
- **Code questions:** See [Codebase Summary](./codebase-summary.md)

---

**Last Updated:** 2026-02-27
**Documentation Status:** Production-ready for Phase 2 (Multi-Channel Gateway)
