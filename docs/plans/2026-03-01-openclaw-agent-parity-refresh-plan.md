# OpenClaw Agent Parity Refresh Plan

**Date:** 2026-03-01  
**Status:** Active  
**Supersedes:** ad-hoc plan notes from 2026-02-28 swarm work

## Purpose

Update the migration plan using the current repository state so implementation can continue with accurate priorities and phase gates.

## Verified Current State

## Build and test health

- `cargo check --workspace` passes.
- `cargo test --workspace` passes (only existing ignored test: `crates/server/tests/e2e_test.rs` placeholder).

## Landed since previous planning cycle

- Agent swarm foundation exists in `crates/agent`:
  - `agent_manager.rs`
  - `tools/delegate_to_agent.rs`
  - `tools/spawn_agent.rs`
  - `ToolExecutionContext.delegation_depth`
- Bundled agent templates are embedded in `crates/common/src/agents.rs` and written during init.
- Approval gate and websocket approval flow are integrated in `crates/server`.
- Channel crates are under `crates/extensions/*`.
- OpenAI provider code is reorganized under `crates/providers/src/openai/*`.

## Not yet implemented (critical parity gaps)

- No `AgentRuntime` API (`run`, `abort`, `queue_followup`, `wait`) yet.
- No parity feature flags (`agent_runtime_v2`, `strict_parity_mode`) yet.
- No parity fixture harness for OpenClaw agent contracts.
- No OpenClaw-level model selection/auth/fallback parity in Rust agent runtime.
- No policy-aware `ToolV2` contract and layered policy pipeline parity.
- No OpenClaw-equivalent run lifecycle cache and wait semantics in agent crate.
- No sandbox/subagent/skills prompt parity architecture from the full migration plan.

## Planning Decisions (Locked)

1. Keep current `AgentEngine` behavior stable while introducing new runtime in parallel.
2. Implement parity-first with safe optimizations only when covered by parity tests.
3. Use feature-flagged cutover to avoid risky big-bang migration.
4. Treat existing swarm features as a foundation layer, not as completion of agent parity.

## Revised Phase Plan

## Phase A0: Contract Freeze and Parity Matrix

**Goal:** Define exact parity targets before more runtime work.

### Deliverables

- `docs/plans/openclaw-agent-parity-matrix.md`:
  - Maps OpenClaw source modules to RushDino targets.
  - Tracks `not-started | in-progress | parity-verified`.
- `tests/parity/agent/fixtures/`:
  - Initial JSON fixtures for run input, stream events, wait snapshots, tool-policy outcomes.
- `crates/agent/src/parity.rs`:
  - Shared parity types used by tests only.

### Exit criteria

- Matrix covers runtime, tools, model selection/auth, subagents, sandbox, skills.
- Fixture schema is frozen and reviewed.

## Phase A1: Runtime API and Compatibility Layer

**Goal:** Introduce target runtime API without breaking existing routes.

### Deliverables

- New `crates/agent/src/runtime/` module with:
  - `AgentRuntime`
  - `AgentRunRequest`
  - `AgentRunResult`
  - `AgentStreamEvent`
  - `AgentRunSnapshot`
- `AgentEngine` methods become wrappers over `AgentRuntime`.
- Add feature flags in common config:
  - `agent_runtime_v2`
  - `strict_parity_mode`

### Exit criteria

- Current server chat/ws endpoints behave unchanged by default.
- Runtime API is available for gradual migration.

## Phase A2: Run Registry, Queueing, Abort, Wait

**Goal:** Port OpenClaw-style lifecycle foundations.

### Deliverables

- `runtime/queue.rs`: per-session lane + optional global lane.
- `runtime/runs_registry.rs`: active run registry, abort state.
- `runtime/wait_cache.rs`: lifecycle end/error caching with grace window.
- Bench baseline command for concurrency and wait latency.

### Exit criteria

- Deterministic one-active-run-per-session behavior.
- `wait(run_id)` returns parity-aligned status (`ok | error | timeout`).

## Phase A3: Model and Agent Scope Parity

**Goal:** Port core model selection/auth behavior and scope resolution.

### Deliverables

- `scope/agent_scope.rs`, `scope/session_keys.rs`, `scope/workspace.rs`.
- `models/model_selection.rs`, `models/model_auth.rs`, `models/model_catalog.rs`, `models/model_fallback.rs`.
- Config wiring in `crates/common` for needed parity fields.

### Exit criteria

- Provider/model resolution and auth precedence validated by fixtures.
- Agent/workspace/session scope isolation validated by tests.

## Phase A4: ToolV2 and Policy Pipeline

**Goal:** Replace current minimal registry with policy-aware parity architecture.

### Deliverables

- `tools/registry_v2.rs` with metadata + schema normalization.
- `tools/policy.rs` and `tools/policy_pipeline.rs`.
- Coding-tool parity track (`read/write/edit/apply_patch/exec/process`) with guards.

### Exit criteria

- Policy layering tests pass (global/provider/agent/group/sandbox/subagent).
- Dangerous command approval and context checks remain enforced.

## Phase A5: Streaming, Compaction, and Output Shaping

**Goal:** Align stream behavior with OpenClaw lifecycle/tool boundaries.

### Deliverables

- `runtime/stream_subscribe.rs` and `runtime/events.rs` for lifecycle/assistant/tool streams.
- Reset semantics around tool boundaries.
- Compaction retry state reset and duplicate output suppression.

### Exit criteria

- Streaming parity fixtures pass (assistant delta, tool events, lifecycle, finalization).
- Memory profile under concurrent streams remains within baseline budget.

## Phase A6: Skills, Subagents, Sandbox Parity

**Goal:** Port remaining high-coupling subsystems.

### Deliverables

- `skills/` modules for snapshot/refresh/prompt synthesis.
- `subagents/` modules for lifecycle registry and persistence behavior.
- `sandbox/` modules for path guards and policy interplay.

### Exit criteria

- Subagent lifecycle persistence tests pass.
- Sandbox containment tests pass.
- Skill snapshot and prompt tests pass.

## Phase A7: Integration Cutover and Stabilization

**Goal:** Switch runtime path safely and promote optimizations.

### Deliverables

- Server/gateway paths use `AgentRuntime` under `agent_runtime_v2=true`.
- Parity gate in CI under `strict_parity_mode=true`.
- Rollout checklist and rollback procedure.

### Exit criteria

- Default path switched after soak window.
- Parity matrix marked complete for committed scope.

## Immediate Next Sprint (Execution Order)

1. Create parity matrix file and seed fixture schema (`Phase A0`).
2. Scaffold `runtime/` API types and compat wrappers (`Phase A1`).
3. Implement run registry and wait cache with unit tests (`Phase A2`).
4. Add config feature flags and server wiring (default off).
5. Add benchmark harness for run setup latency and wait throughput.

## Acceptance Test Matrix (Minimum)

- Queue serialization and run exclusivity by session.
- Wait semantics with transient error grace handling.
- Delegation depth guard and nested context propagation.
- Model/provider normalization and alias resolution.
- Auth precedence profile/env/config.
- Tool policy precedence and dangerous command approval flow.
- Streaming reset at tool boundaries and final event semantics.
- Subagent lifecycle persistence and recovery.
- Sandbox path containment and workspace mapping.

## Risk Notes

- Current green tests are mostly local-unit tests; parity confidence remains low without fixture harness.
- Existing swarm additions can drift from OpenClaw parity if runtime contracts are not frozen early.
- CLI surface has many placeholder commands; avoid coupling runtime cutover to unfinished CLI parity.
