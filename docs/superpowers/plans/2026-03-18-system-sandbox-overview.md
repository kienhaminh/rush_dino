# System Sandbox Overview Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/system/sandbox` into a read-only RushDino sandbox overview covering global shell sandbox posture, per-agent policies, live sessions, and the existing audit log.

**Architecture:** Reuse existing system summary, config, agent list, and session audit APIs wherever possible. Add one narrow backend change so the agent list includes optional parsed sandbox policy data, then refactor the sandbox page to compose those sources into a single operator-facing surface.

**Tech Stack:** Rust with Axum on the backend, React + TypeScript frontend, existing shadcn/ui components, Vitest/Jest-style node tests.

---

## Chunk 1: Backend agent sandbox policy exposure

### Task 1: Extend agent list response shape

**Files:**
- Modify: `crates/server/src/routes/agents.rs`
- Modify: `frontend/src/pages/agents/agent-types.ts`
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Write the failing backend test**

Add or extend a route serialization test that expects `GET /api/agents` items to include `sandboxPolicy` when an agent has a sandbox policy.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p server agents`
Expected: FAIL because `sandboxPolicy` is not serialized in the agent list response.

- [ ] **Step 3: Write minimal implementation**

Add optional sandbox policy fields to the server response type and map `agent.sandbox_policy` through `list_agents`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p server agents`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/agents.rs frontend/src/pages/agents/agent-types.ts frontend/src/lib/types.ts
git commit -m "feat: expose agent sandbox policy summaries"
```

## Chunk 2: Frontend sandbox overview data model

### Task 2: Thread sandbox policy data into frontend types

**Files:**
- Modify: `frontend/src/pages/agents/agent-types.ts`
- Modify: `frontend/src/lib/types.ts`
- Test: `frontend/src/pages/sandbox/SandboxMonitorPage.node.test.tsx`

- [ ] **Step 1: Write the failing frontend test**

Create a page test that renders sandbox overview data and expects agent sandbox policy posture to appear.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- SandboxMonitorPage.node.test.tsx`
Expected: FAIL because the page does not request or render the new posture.

- [ ] **Step 3: Write minimal implementation**

Update TypeScript shapes so the sandbox page can consume `sandboxPolicy` directly from `fetchAgents()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- SandboxMonitorPage.node.test.tsx`
Expected: PASS once the page uses the data.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/agents/agent-types.ts frontend/src/lib/types.ts frontend/src/pages/sandbox/SandboxMonitorPage.node.test.tsx
git commit -m "test: add sandbox overview data coverage"
```

## Chunk 3: Sandbox overview page refactor

### Task 3: Add read-only global shell sandbox section

**Files:**
- Modify: `frontend/src/pages/sandbox/SandboxMonitorPage.tsx`
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/pages/sandbox/SandboxMonitorPage.node.test.tsx`

- [ ] **Step 1: Write the failing test**

Expect `/system/sandbox` to show shell sandbox enabled state, network posture, workspace root, and extra write roots.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- SandboxMonitorPage.node.test.tsx`
Expected: FAIL because the page only shows audit-log content.

- [ ] **Step 3: Write minimal implementation**

Load `fetchSystemSummary()` and `fetchConfig()`, then render a read-only shell sandbox posture card.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- SandboxMonitorPage.node.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sandbox/SandboxMonitorPage.tsx frontend/src/lib/api.ts frontend/src/pages/sandbox/SandboxMonitorPage.node.test.tsx
git commit -m "feat: add shell sandbox posture to system sandbox page"
```

### Task 4: Add agent policy summary section

**Files:**
- Modify: `frontend/src/pages/sandbox/SandboxMonitorPage.tsx`
- Test: `frontend/src/pages/sandbox/SandboxMonitorPage.node.test.tsx`

- [ ] **Step 1: Write the failing test**

Expect the page to list agents and show whether each has a sandbox policy plus compact policy details.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- SandboxMonitorPage.node.test.tsx`
Expected: FAIL because the page has no agent policy section.

- [ ] **Step 3: Write minimal implementation**

Render a read-only agent policy table using `fetchAgents()` data and compact badge/count summaries.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- SandboxMonitorPage.node.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sandbox/SandboxMonitorPage.tsx frontend/src/pages/sandbox/SandboxMonitorPage.node.test.tsx
git commit -m "feat: add agent sandbox policy overview"
```

### Task 5: Reshape live session and audit sections

**Files:**
- Modify: `frontend/src/pages/sandbox/SandboxMonitorPage.tsx`
- Test: `frontend/src/pages/sandbox/SandboxMonitorPage.node.test.tsx`

- [ ] **Step 1: Write the failing test**

Expect the page to preserve session drill-down while also showing session posture metadata in the sidebar or summary row.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- SandboxMonitorPage.node.test.tsx`
Expected: FAIL because session posture is not summarized.

- [ ] **Step 3: Write minimal implementation**

Compute pending counts, latest audit times, and agent ids from audit entries, and display them in the live session area while keeping existing actions.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- SandboxMonitorPage.node.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sandbox/SandboxMonitorPage.tsx frontend/src/pages/sandbox/SandboxMonitorPage.node.test.tsx
git commit -m "feat: enrich sandbox session posture overview"
```

## Chunk 4: Final verification

### Task 6: Run focused verification

**Files:**
- Test: `frontend/src/pages/sandbox/SandboxMonitorPage.node.test.tsx`
- Test: backend agent route tests

- [ ] **Step 1: Run backend tests**

Run: `cargo test -p server agents`
Expected: PASS

- [ ] **Step 2: Run frontend tests**

Run: `npm run test -- SandboxMonitorPage.node.test.tsx`
Expected: PASS

- [ ] **Step 3: Run any related typecheck or targeted suite if needed**

Run: `npm run test -- frontend/src/components/system/system-summary-panels.node.test.tsx`
Expected: PASS

- [ ] **Step 4: Review diffs**

Run: `git diff --stat`
Expected: only the planned backend, frontend, and docs files changed.

Plan complete and saved to `docs/superpowers/plans/2026-03-18-system-sandbox-overview.md`. Ready to execute?
