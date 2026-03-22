# Agent Runtime Model Selection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove per-agent default model configuration so agent templates and the Agents UI no longer store or expose agent-specific model defaults.

**Architecture:** Keep model selection in the runtime/provider layer instead of agent templates. Remove the `model` field from agent template parsing/serialization and stop workflow execution from injecting template-level model overrides. Update the Agents UI and API shape so agent records no longer include a per-agent model and the overview explains runtime selection instead of editing a primary model.

**Tech Stack:** Rust, Axum, Serde, React, TypeScript, Vitest

---

## Chunk 1: Red Tests

### Task 1: Add failing backend and frontend coverage for removed per-agent model config

**Files:**
- Modify: `crates/server/src/routes/agents.rs`
- Modify: `crates/agent/src/agent_manager.rs`
- Create: `frontend/src/pages/agents/AgentOverview.node.test.ts`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run the targeted tests to verify they fail for the current behavior**

## Chunk 2: Backend Removal

### Task 2: Remove model fields from agent templates and workflow overrides

**Files:**
- Modify: `crates/agent/src/agent_manager.rs`
- Modify: `crates/agent/src/workflow_runner.rs`
- Modify: `crates/server/src/routes/agents.rs`
- Modify: `crates/common/src/agents/*.toml`

- [ ] **Step 1: Remove template parsing/serialization support for per-agent `model`**
- [ ] **Step 2: Remove workflow step usage of template model overrides**
- [ ] **Step 3: Remove agent list API `model` payloads**

## Chunk 3: Frontend Removal

### Task 3: Remove per-agent model UI and data plumbing

**Files:**
- Modify: `frontend/src/pages/agents/AgentOverview.tsx`
- Modify: `frontend/src/pages/agents/agent-types.ts`
- Modify: `frontend/src/pages/agents/agent-mock-data.ts`

- [ ] **Step 1: Remove the model configuration panel and per-agent model card**
- [ ] **Step 2: Replace it with runtime-selection copy**
- [ ] **Step 3: Remove `model` from shared agent types and fixtures**

## Chunk 4: Verification

### Task 4: Run focused suites and fix regressions

**Files:**
- Test: `crates/agent/src/agent_manager.rs`
- Test: `crates/server/src/routes/agents.rs`
- Test: `frontend/src/pages/agents/AgentOverview.node.test.ts`

- [ ] **Step 1: Run backend targeted tests**
- [ ] **Step 2: Run frontend targeted tests**
- [ ] **Step 3: Fix any regressions and rerun**
