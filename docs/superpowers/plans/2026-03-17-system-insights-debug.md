# System Insights Debug Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake Debug page with a real read-only System Insights surface backed by existing system summary, diagnostics, and log data.

**Architecture:** Reuse `/api/system/summary`, `/api/system/doctor`, and `/api/logs` rather than inventing a broad debug backend. Keep the route and page shell, but rewrite the page around real operator signals and direct action links while removing the manual RPC and mocked snapshot/event-console concepts.

**Tech Stack:** React, TypeScript, Vitest

---

## Chunk 1: Frontend page replacement

### Task 1: Add failing render coverage for the repurposed page

**Files:**
- Add: `frontend/src/pages/debug/debug-page.node.test.tsx`
- Modify: `frontend/src/pages/debug/DebugPage.tsx`

- [ ] Step 1: Add a render test that expects real system-insights sections and asserts the old manual RPC/debug-event console copy is gone.
- [ ] Step 2: Run the focused frontend test command and confirm it fails before the page rewrite.

### Task 2: Replace the fake Debug page with real system insights

**Files:**
- Modify: `frontend/src/pages/debug/DebugPage.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/types.ts`

- [ ] Step 1: Load system summary and doctor data from existing backend routes.
- [ ] Step 2: Render operator-facing sections for health, queue posture, approvals, channels, findings, incidents, security, and runtime config.
- [ ] Step 3: Remove the old manual RPC, fake model list, fake event log, and mock refresh behavior.
- [ ] Step 4: Re-run the focused debug page test and make it pass.

## Chunk 2: Verification and review

### Task 3: Run focused verification and document the result

**Files:**
- Modify: `tasks/todo.md`

- [ ] Step 1: Run the focused debug page render test.
- [ ] Step 2: Run frontend typecheck.
- [ ] Step 3: Run frontend build.
- [ ] Step 4: Record the implementation summary and verification commands in `tasks/todo.md`.
