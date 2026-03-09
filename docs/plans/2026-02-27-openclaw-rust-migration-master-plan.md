# OpenClaw to Rust Migration Master Plan

## Objective

Migrate the full `openclaw/` system into Rust within this repository (`RushDino` workspace), in incremental phases that preserve behavior and reduce delivery risk.

## What This Plan Assumes

- Full migration target: gateway, agents, channels, CLI, web/control plane, automation/runtime behaviors.
- Step-by-step execution: each phase must compile, test, and keep clear rollback boundaries.
- Rust is the runtime target; Node/TypeScript remains temporary during transition only.

## Current Baseline (Measured)

- `openclaw/` is a standalone nested project (its own `.git`, toolchain, CI scripts).
- Language footprint:
  - TypeScript: ~4,777 files
  - Swift: ~518 files
  - Rust: 0 files
- `openclaw/src` TS size is very large (~726k LOC), so direct rewrite is not feasible.

## Migration Principles

1. Parity before redesign.
2. Strangler pattern: replace subsystems behind stable contracts.
3. Minimize moving parts per phase.
4. Keep tests and fixtures as migration gates.
5. Avoid broad speculative architecture changes (YAGNI/KISS/DRY).

## Target Rust Architecture (Workspace Mapping)

### Existing crates to extend

- `crates/common`
  - Config, credentials, schema models, migrations, shared errors/types.
- `crates/gateway`
  - Channel abstraction, router, session routing, dispatch contracts.
- `crates/server`
  - Control-plane HTTP/WS endpoints, auth, runtime state orchestration.
- `crates/agent`
  - Agent orchestration, session logic, tool lifecycle.
- `crates/providers`
  - Model providers/auth/profile/fallback logic.
- `crates/cli`
  - Onboard/init/status/doctor and operator workflows.

### Candidate new crates (as needed)

- `crates/protocol` for gateway WS/JSON-RPC contracts and shared schema serialization.
- `crates/tools` for tool registry, command execution policy, approvals.
- `crates/channels-*` for channels not yet covered by existing adapter crates.
- `crates/runtime-compat` for temporary cross-runtime adapters during migration.

## Phase Plan

## Phase 1 - Contract Freeze and Parity Harness

### Scope

- Freeze protocol envelopes, session payloads, config schema, auth/session surfaces used by OpenClaw clients.
- Create migration fixtures from `openclaw` behavior (golden inputs/outputs).
- Define feature parity matrix by subsystem.

### Exit Criteria

- Contract docs in Rust repo are versioned and reviewed.
- Fixture-based tests run in Rust workspace (failing/ignored allowed initially, but wired).
- Every major subsystem has a declared parity target.

## Phase 2 - Core Runtime Parity

### Scope

- Implement configuration and credentials parity in `common`.
- Implement control-plane server and session scaffolding in `server`.
- Implement gateway message/session routing parity in `gateway`.

### Exit Criteria

- Rust gateway boot sequence mirrors critical OpenClaw behavior for core session flow.
- Core server+gateway integration tests pass.

## Phase 3 - Agent, Providers, and Tools Parity

### Scope

- Port provider selection/auth/fallback mechanics into `providers`.
- Port session orchestration/tool dispatch mechanics into `agent`.
- Implement command/tool safety policies (approval/sandbox semantics).

### Exit Criteria

- Equivalent agent request/response flow for defined MVP fixtures.
- Provider fallback and tool invocation tests pass for parity scenarios.

## Phase 4 - Channel Parity

### Scope

- First-wave parity: Telegram, Discord, Slack, Web.
- Next waves: remaining channels/extensions by usage priority.

### Exit Criteria

- First-wave channels are end-to-end functional in Rust.
- Channel-specific gating/auth/session semantics match parity fixtures.

## Phase 5 - CLI Parity

### Scope

- Port high-value command surfaces: onboard/config/doctor/status/start/stop.
- Preserve operator workflows and safety checks.

### Exit Criteria

- Core operational CLI flows run fully on Rust implementation.
- Migration guide for old command behavior completed.

## Phase 6 - Web/Control Plane and Ops Hardening

### Scope

- Port control-plane APIs consumed by UI.
- Add observability/health/metrics/audit hooks and hardened auth defaults.

### Exit Criteria

- Control plane stable under load tests for target usage profile.
- Security and ops checklists pass.

## Phase 7 - Cutover and Decommission

### Scope

- Remove Node runtime dependencies from production path.
- Mark compatibility adapters deprecated, then remove.

### Exit Criteria

- Rust path is default and documented.
- Decommission checklist complete.

## Initial Feature Priority (Recommended)

1. Gateway protocol + session lifecycle
2. Agent execution + tool approval/sandbox flow
3. Core channels (Telegram/Discord/Slack/Web)
4. CLI operational commands
5. Remaining channels/extensions

## Risk Register

- Scope explosion from attempting all channels/extensions at once.
- Hidden coupling in OpenClaw TypeScript modules.
- Auth/provider edge-case drift if fixtures are incomplete.
- Operational regressions without staged load and chaos testing.

## Mitigations

- Enforce subsystem-by-subsystem cut lines.
- Keep migration parity fixtures mandatory for merge gates.
- Add phase-specific non-goals to avoid design drift.
- Run shadow-mode tests before full cutover.

## Definition of Done (Program Level)

- All selected OpenClaw production features have Rust equivalents.
- Rust implementation is the default execution path.
- Documentation and runbooks are updated for contributors/operators.
- Node implementation is no longer required for core production usage.

## 2026-03-01 Status Refresh

### Verified current baseline

- `cargo check --workspace` passes.
- `cargo test --workspace` passes (one intentionally ignored server e2e placeholder remains).
- Agent swarm groundwork has landed:
  - `crates/agent/src/agent_manager.rs`
  - `crates/agent/src/tools/delegate_to_agent.rs`
  - `crates/agent/src/tools/spawn_agent.rs`
  - bundled templates in `crates/common/src/agents/*.toml`
- Safety and streaming v2 remediation remains integrated and green.

### Program gap update

The migration is still in early-to-mid stage despite recent feature additions:

- `AgentRuntime` API (run/abort/queue/wait) is not implemented yet.
- No parity fixture harness exists for OpenClaw agent contracts.
- No parity feature flags (`agent_runtime_v2`, `strict_parity_mode`) exist yet.
- OpenClaw model selection/auth/fallback semantics are not ported in parity form.
- Tool policy pipeline parity, sandbox parity, and subagent lifecycle parity are incomplete.

### Updated near-term execution order

1. **Phase A0:** Contract freeze for agent runtime and add parity matrix + fixture schema.
2. **Phase A1:** Introduce `AgentRuntime` and compatibility adapters under `AgentEngine`.
3. **Phase A2:** Implement queue/runs/wait lifecycle cache parity.
4. **Phase A3:** Port model/scope/auth core parity.
5. **Phase A4+:** ToolV2 policy pipeline, streaming parity, then skills/subagents/sandbox.

### Updated guardrails

- Keep parity as acceptance baseline for each phase.
- Land only safe optimizations while parity tests remain green.
- Keep compatibility mode until feature-flagged cutover is validated.
