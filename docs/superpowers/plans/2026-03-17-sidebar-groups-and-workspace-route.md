# Sidebar Groups And Workspace Route Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the global sidebar into a standalone Workspace item plus grouped Operation and System sections, and give Workspace its own explicit page route.

**Architecture:** Keep the existing builder, system, operations, and config pages intact, but add sidebar-specific navigation metadata that points directly to the desired child routes. Promote Workspace from an implicit `/` landing page to an explicit `/workspace` page while preserving backward-compatible redirects from older entry points.

**Tech Stack:** React, React Router, TypeScript, Vitest

---

## Chunk 1: Sidebar Nav Contract

### Task 1: Add route metadata tests for grouped sidebar navigation

**Files:**
- Modify: `frontend/src/lib/dashboard-routes.node.test.ts`
- Test: `frontend/src/lib/dashboard-routes.node.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement minimal metadata updates**
- [ ] **Step 4: Run test to verify it passes**

### Task 2: Add workspace route redirect expectations

**Files:**
- Modify: `frontend/src/lib/dashboard-routes.node.test.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Assert `/workspace` resolves as the workspace shell page**
- [ ] **Step 2: Assert legacy chat/root entry points redirect safely**
- [ ] **Step 3: Implement the route updates**
- [ ] **Step 4: Re-run the focused tests**

## Chunk 2: Sidebar Rendering

### Task 3: Render grouped sidebar sections from metadata

**Files:**
- Modify: `frontend/src/components/sidebar/sidebar.tsx`
- Modify: `frontend/src/lib/dashboard-routes.ts`

- [ ] **Step 1: Add standalone/grouped sidebar structures**
- [ ] **Step 2: Render section headings and direct destination links**
- [ ] **Step 3: Keep collapse behavior and active states intact**
- [ ] **Step 4: Run focused tests**

## Chunk 3: Review

### Task 4: Verify and document results

**Files:**
- Modify: `tasks/todo.md`

- [ ] **Step 1: Run `cd frontend && npm run test:node -- src/lib/dashboard-routes.node.test.ts`**
- [ ] **Step 2: Run `cd frontend && npm run check:types`**
- [ ] **Step 3: Summarize the implementation and verification in `tasks/todo.md`**
