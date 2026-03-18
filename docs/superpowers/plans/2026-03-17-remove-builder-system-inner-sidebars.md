# Remove Builder And System Inner Sidebars Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the secondary builder/system side panels so the global sidebar is the only left-side navigation and the page content uses the full main area.

**Architecture:** Keep the global grouped sidebar unchanged and simplify the `BuilderPage` and `SystemPage` shells into plain outlet containers. Add focused shell tests first so the removal is proven by behavior rather than by manual inspection.

**Tech Stack:** React, React Router, TypeScript, Vitest

---

## Chunk 1: Remove Secondary Shell Rails

### Task 1: Add failing shell coverage

**Files:**
- Modify: `frontend/src/pages/page-shell-banners.node.test.tsx`
- Test: `frontend/src/pages/page-shell-banners.node.test.tsx`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write the minimal implementation**
- [ ] **Step 4: Re-run the test to verify it passes**

### Task 2: Simplify builder and system shell pages

**Files:**
- Modify: `frontend/src/pages/builder/BuilderPage.tsx`
- Modify: `frontend/src/pages/system/SystemPage.tsx`

- [ ] **Step 1: Remove the inner sidebar markup**
- [ ] **Step 2: Keep the outlet container full-width**
- [ ] **Step 3: Re-run focused verification**

### Task 3: Record results

**Files:**
- Modify: `tasks/todo.md`

- [ ] **Step 1: Run `cd frontend && npm run test:node -- src/pages/page-shell-banners.node.test.tsx`**
- [ ] **Step 2: Run `cd frontend && npm run check:types`**
- [ ] **Step 3: Run `cd frontend && npm run build`**
- [ ] **Step 4: Summarize the review in `tasks/todo.md`**
