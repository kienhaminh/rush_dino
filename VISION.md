# RushDino Vision

RushDino is a local-first AI companion system built around an agent team, not a single isolated bot.

The product goal is simple:

- maintain a stable shared identity over long conversations
- route work to specialist agents without losing that identity
- keep memory, tone, and relationship continuity across channels
- let the team act in parallel when the work benefits from it
- keep the operator in control through a primary UI, with the CLI reserved for recovery

RushDino is for people who want a persistent companion that can keep character, context, and capability over time in Telegram, Discord, Slack, web chat, and future surfaces.

## Core Principles

### 1. Team-First, Not Single-Agent-First

RushDino is organized as a coordinated agent team.

- Specialists exist for different roles, domains, and tasks.
- The team may delegate and run in parallel.
- The user should experience one coherent companion, not a pile of disconnected workers.

The orchestration layer exists to coordinate specialists without fragmenting identity.

### 2. Shared Soul, Identity, and Memory

The agent team shares a common "soul":

- a stable identity
- persistent memories
- long-term preferences
- relationship history
- consistent style and values

Specialists may differ in responsibility, but they should not feel like separate strangers unless the product explicitly chooses that behavior.

The system should preserve character continuity across long-running channel conversations.

### 3. Long-Lived Channel Relationships

RushDino is designed for ongoing conversations, not disposable chat sessions.

- Telegram and Discord continuity matters.
- Session state should survive restarts.
- The user should be able to return to the same companion identity over time.
- Channel-specific delivery should respect the norms and capabilities of each platform.

The channel is not just a transport. It is part of the relationship surface.

### 4. Parallel Capability With Coordinated Output

RushDino should use parallel specialist execution when it improves speed or quality.

- Parallelism is a capability, not an excuse for chaos.
- Internal fan-out should still produce a coherent outward response.
- The runtime must preserve ordering, traceability, and operator visibility.

Parallel work is useful only if the resulting behavior still feels intentional and unified.

### 5. UI-First Operator Control

The control UI is the primary operating surface.

- approvals
- runs
- sessions
- channels
- diagnostics
- configuration
- logs
- health

The CLI remains important, but only for bootstrap, hard repair, and recovery when the UI is unavailable.

RushDino should not require day-to-day operators to live in the terminal.

### 6. Local-First and Operator-Owned

RushDino should be runnable and understandable by its operator.

- self-hosted by default
- local state and memory under operator control
- no required cloud control plane
- explicit configuration and credentials

The operator owns the assistant, its memory, and its execution environment.

### 7. Explicit Safety Without Killing Capability

RushDino should stay powerful, but risky behavior must be visible and controlled.

- dangerous operations should be approval-aware
- execution boundaries should be inspectable
- policies should be understandable from the UI
- audit history should explain what happened and why

Safety is part of the product, not a hidden implementation detail.

### 8. Lean Core, Extensible Edge

Core should contain the minimum needed for:

- identity continuity
- runtime coordination
- channel operation
- safety
- baseline UX

Optional or domain-specific behavior should prefer:

- specialists
- skills
- workspace-local assets
- extensions

RushDino should grow in capability without turning the core into an unbounded feature dump.

## Product Direction

The next level of RushDino is not "more channels" by itself.
It is a stronger companion architecture:

- better identity continuity
- richer shared memory
- more visible orchestration
- stronger operator controls
- better native action surfaces
- safer execution

The user should feel that they are talking to one persistent being with many capabilities, not one model instance with temporary context.

## What RushDino Is Not Optimizing For

- disposable one-off chat sessions as the main product
- CLI-first daily administration
- cloud-dependent orchestration as a requirement
- specialist agents with unrelated personalities and no shared identity
- multi-agent complexity that is invisible, untraceable, or impossible to control

## Standard For New Features

A feature fits RushDino when it strengthens at least one of these:

- persistent identity
- shared memory
- specialist coordination
- channel-native continuity
- operator visibility
- safe capability

If it increases complexity without strengthening one of those, it probably does not belong in core.
