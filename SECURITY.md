# RushDino Security

RushDino is designed to be powerful, persistent, and operator-owned.
That combination raises the bar for security.

This document defines the security contract for a system built around:

- long-lived channel conversations
- specialist agent teams
- shared memory and identity
- local execution
- operator-controlled automation

## Security Goals

RushDino security aims to preserve five things:

1. Operator control
2. Memory and identity integrity
3. Safe execution boundaries
4. Channel trust and continuity
5. Clear auditability

The goal is not to remove capability.
The goal is to make risky capability explicit, reviewable, and containable.

## Threat Model

RushDino should assume risk from:

- malicious or accidental tool calls
- prompt injection through user messages, web content, or imported memory
- confused-deputy behavior across specialist agents
- channel spoofing or unsafe message routing
- credential leakage
- unintended persona or memory corruption
- runaway parallel execution

The system should not rely on "the model will probably behave" as a primary defense.

## Security Principles

### 1. The Operator Owns the Final Decision

High-risk actions must remain operator-controlled.

Examples:

- shell execution outside trusted bounds
- destructive file actions
- credential-sensitive actions
- browser or device actions with side effects
- policy changes
- operations that affect shared memory or identity state

Approval, denial, and audit history should be visible in the UI.

### 2. Shared Identity Requires Stronger Protection

RushDino's shared soul, memory, and persona are part of the product surface.

That means memory corruption is not a minor bug.
It can change the system's long-term behavior and relationship with users.

Memory and identity operations should therefore be:

- explicit
- attributable
- reversible where practical
- scoped
- auditable

### 3. Execution Must Stay Inside Clear Boundaries

Every dangerous or privileged action should carry visible execution context:

- who requested it
- which session or channel it came from
- which run triggered it
- which agent or specialist initiated it
- what policy decision was applied
- what sandbox or scope was in effect

Operators should be able to understand execution without reading source code.

### 4. Channels Are Trust Boundaries

Telegram, Discord, Slack, web chat, and future channels are not equivalent.

Security-sensitive behavior must account for:

- sender identity
- channel/session ownership
- duplicate or replayed messages
- delivery failures
- native UI features such as buttons or future callbacks

Long-lived channel continuity is valuable, but it must not blur trust boundaries between users, sessions, or rooms.

### 5. Parallelism Must Not Bypass Safety

Parallel specialist execution is a feature of RushDino.
It must not become a safety escape hatch.

Parallel runs should still:

- obey policy
- respect approvals
- preserve attribution
- remain traceable in logs and run timelines

Concurrency should never hide who did what.

## Required Controls

### Identity and Memory Controls

- Shared memory writes must be scoped and attributable.
- Persona or identity mutations should be explicit operations, not incidental side effects.
- Imported content should be treated as untrusted input until validated.
- Long-term memory should prefer additive, reviewable updates over silent mutation.

### Tool and Runtime Controls

- Risky tools should expose `allow`, `ask`, or `deny` outcomes clearly.
- Approval state should be attached to runs and surfaced in the UI.
- Sandbox state and effective scope should be inspectable.
- Runtime events should record execution and delivery outcomes.

### Channel Controls

- Session ownership must be stable and persisted.
- Duplicate inbound events should be suppressed where channel metadata allows it.
- Rich outbound delivery should degrade safely when native payloads are unsupported or rejected.
- Native UI delivery must never skip fallback text.

### Credential Controls

- Credentials must stay out of logs.
- Secrets should be stored separately from normal product data.
- The system should prefer explicit credential configuration over hidden convenience behavior.
- Missing or invalid credentials should surface clearly in diagnostics.

## Default Safety Posture

RushDino should default to:

- local-first deployment
- explicit configuration
- approval-aware dangerous actions
- auditable run and delivery history
- visible policy outcomes
- bounded routing and delivery behavior

It should not default to silent escalation, hidden remote dependencies, or opaque background authority.

## Operator Expectations

Operators should be able to answer these questions from the product:

- Which agent or specialist acted?
- Why did it act?
- What did it try to do?
- Was approval required?
- What policy allowed or blocked it?
- What memory or identity state could it affect?
- What happened on the channel afterward?

If the system cannot answer those questions, the security model is incomplete.

## Non-Goals

RushDino security does not aim to:

- eliminate all powerful actions
- hide security decisions behind convenience wrappers
- treat all channels as equally trusted
- rely on single-agent assumptions in a team-oriented system

RushDino should remain capable.
The bar is that capability must stay legible and operator-controlled.
