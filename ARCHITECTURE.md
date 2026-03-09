# RushDino Architecture

This document describes RushDino's intended product architecture at a high level.

For crate-level and route-level implementation details, see [docs/system-architecture.md](./docs/system-architecture.md) and [docs/references/architecture/index.md](./docs/references/architecture/index.md).

## Architectural Model

RushDino is not built around a single stateless chatbot.
It is built around a persistent agent team with one outward identity.

At a high level, the system has six layers:

1. Relationship surfaces
2. Runtime and orchestration
3. Shared identity and memory
4. Specialist agents
5. Action and tool surfaces
6. Operator control and safety

## 1. Relationship Surfaces

Relationship surfaces are where the user experiences RushDino:

- Telegram
- Discord
- Slack
- web chat
- future browser, desktop, and device surfaces

These surfaces should feel like access points to the same companion.

That means each surface must preserve:

- identity continuity
- session continuity
- memory continuity
- delivery quality appropriate to the channel

The gateway exists to normalize transport, but it should not erase channel context.

## 2. Runtime and Orchestration

The runtime is the coordination layer that turns user intent into team behavior.

Its responsibilities are:

- run lifecycle management
- session and conversation continuity
- queueing and concurrency control
- approval and policy state
- execution traceability
- streaming and final response delivery

The runtime should be the source of truth for what is happening now and what happened before.

## 3. Shared Soul, Identity, and Memory

RushDino's team shares a single higher-level companion identity.

This layer includes:

- shared persona and tone
- long-term memory
- user relationship context
- stable preferences and values
- channel-spanning continuity

Specialists consume and contribute to this layer, but they should not fragment it.

This layer is what makes a Telegram conversation today feel connected to a Discord conversation tomorrow.

## 4. Specialist Agents

Specialists are focused workers inside the team.

Examples of specialization may include:

- research
- coding
- planning
- memory management
- channel formatting
- browser or device action

Specialists should:

- have clear responsibilities
- be composable by the orchestrator
- be attributable in runtime traces
- share the same core identity contract unless explicitly designed otherwise

Parallel execution is allowed, but the outward result must still feel coherent.

## 5. Action and Tool Surfaces

Tools and action surfaces are how RushDino actually does things.

This includes:

- provider calls
- file and workspace operations
- browser control
- future device or app interactions
- channel-native delivery surfaces
- memory and knowledge operations

The architecture should separate:

- core runtime coordination
- safe first-class operations
- optional or domain-specific extensions

Core should stay lean.
Optional capability should prefer specialists, skills, workspace-local assets, or extensions over core sprawl.

## 6. Operator Control Plane

RushDino is UI-first for operators.

The control plane should expose:

- runs
- approvals
- sessions
- channels
- diagnostics
- config
- logs
- health

The CLI remains a recovery surface for:

- bootstrap
- service control
- hard repair
- offline diagnostics

Operators should not need terminal-only knowledge for normal administration.

## Reference Architecture

```text
Users
  |
  v
Telegram / Discord / Slack / Web UI
  |
  v
Gateway + Channel Delivery
  |
  v
Runtime / Orchestrator
  |        \
  |         \--> Operator Control UI
  |
  +--> Shared Identity / Memory / Relationship State
  |
  +--> Specialist Agent Team
  |
  +--> Tools / Browser / Files / Knowledge / Future Actions
  |
  v
Persistence + Audit + Policy State
```

## Architectural Rules

### Coherence Over Fragmentation

If a new component makes the system feel like many unrelated bots, it is working against the product.

### Runtime First

Important behavior should be visible as runtime state, not hidden in adapter glue or one-off code paths.

### Channel-Aware, Not Channel-Owned

Channels matter, but no single channel should define the product model.

### Memory Is Product State

Shared memory and identity are not secondary storage concerns.
They are central system architecture.

### Safety Is a Structural Concern

Approvals, policy decisions, and execution scope should be part of the architecture, not bolted on after features are built.

### Lean Core

Core should carry the minimum required for:

- continuity
- orchestration
- safety
- operability

Everything else should justify why it belongs in core.

## Current Direction

RushDino is moving away from a gateway-first framing and toward a companion-runtime framing:

- from "one engine behind many channels"
- toward "one identity expressed through a coordinated specialist team"

That architectural shift should guide future runtime, UI, memory, and action-surface work.
