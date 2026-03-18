# Operations Summary Simplification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify overview and operations summary UI with compact operator-first status summaries and progressive disclosure for detailed connectivity/runtime state.

**Architecture:** Extract a small shared summary component module for formatting and rendering the compact operational summaries. Update overview to use a single compact operational-status card and update operations to use the same summary language in its shell header.

**Tech Stack:** React 18, TypeScript, React Router, Tailwind utility classes, Vitest node render tests

---

## Chunk 1: Shared summary primitives

### Task 1: Create compact summary helpers and presentation components

**Files:**
- Create: `frontend/src/components/system/system-summary-panels.tsx`
- Test: `frontend/src/components/system/system-summary-panels.node.test.tsx`

- [ ] **Step 1: Add a failing render test**

Cover compact channel/runtime summaries plus the operations summary strip.

- [ ] **Step 2: Implement shared helpers and compact UI**

Add reusable formatting helpers and low-chrome summary components.

- [ ] **Step 3: Run the focused node test**

Run: `cd frontend && ./node_modules/.bin/vitest run src/components/system/system-summary-panels.node.test.tsx --config vitest.node.config.ts`

Expected: PASS

## Chunk 2: Page integration

### Task 2: Integrate compact summaries into overview and operations

**Files:**
- Modify: `frontend/src/pages/overview/OverviewPage.tsx`
- Modify: `frontend/src/pages/operations/OperationsPage.tsx`

- [ ] **Step 1: Replace dense overview middle section**

Keep the existing data, reduce the KPI chrome, and move detailed connectivity/runtime state behind disclosure rows.

- [ ] **Step 2: Simplify the operations shell header**

Use the compact summary strip and preserve refresh/navigation behavior.

- [ ] **Step 3: Run focused verification**

Run:
- `cd frontend && ./node_modules/.bin/vitest run src/components/system/system-summary-panels.node.test.tsx --config vitest.node.config.ts`
- `cd frontend && npm run check:types`

Expected: PASS
