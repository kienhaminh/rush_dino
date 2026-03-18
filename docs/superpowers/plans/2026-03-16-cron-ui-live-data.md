# Cron UI Live Data Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dedicated Cron page mock data with live cron API data, display each job's target agent, and restrict cron mutations to `general-assistant`.

**Architecture:** Reuse the existing cron HTTP routes and shared frontend API layer instead of adding new endpoints. Keep the current Cron page structure, but swap mock state for async data loading and derive display labels from the backend cron target shape while enforcing mutation ownership in backend cron operations.

**Tech Stack:** React, TypeScript, Vitest, Rust, Axum, sqlx

---

## Chunk 1: Frontend cron data wiring

### Task 1: Add failing Cron page coverage for live data and target labeling

**Files:**
- Modify: `frontend/src/pages/cron/CronPage.tsx`
- Modify: `frontend/tests/ui/views/cron.test.ts`

- [ ] Step 1: Add/update a Cron page test that renders API-driven jobs and asserts the target agent label appears for `agent_turn` jobs.
- [ ] Step 2: Add/update a test that verifies workflow-targeted jobs render a non-agent label.
- [ ] Step 3: Run the focused frontend test command and confirm it fails for the expected missing live-data behavior.

### Task 2: Replace mock Cron page data with API-backed state

**Files:**
- Modify: `frontend/src/pages/cron/CronPage.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/pages/cron/cron-types.ts`

- [ ] Step 1: Add or reuse frontend API/types for listing cron jobs and runs from the existing backend routes.
- [ ] Step 2: Refactor `CronPage` to load jobs/runs asynchronously instead of using mock constants.
- [ ] Step 3: Derive the display target label from the backend cron target payload and thread it into the jobs list UI.
- [ ] Step 4: Re-run the focused frontend Cron tests and make them pass.

## Chunk 2: Backend cron ownership enforcement

### Task 3: Add failing backend coverage for restricted cron mutations

**Files:**
- Modify: `crates/server/src/routes/cron.rs`
- Modify: `crates/agent/src/engine.rs`
- Modify: `crates/agent/src/cron_manager.rs`

- [ ] Step 1: Add a backend test that attempts a cron mutation as a non-`general-assistant` actor and expects rejection.
- [ ] Step 2: Run the focused Rust test command and confirm it fails before the enforcement code exists.

### Task 4: Enforce `general-assistant` ownership for cron mutations

**Files:**
- Modify: `crates/server/src/routes/cron.rs`
- Modify: `crates/agent/src/engine.rs`

- [ ] Step 1: Thread an actor id through the cron mutation path with `general-assistant` as the only allowed owner.
- [ ] Step 2: Return a clear error for disallowed cron mutation attempts.
- [ ] Step 3: Re-run the focused Rust tests and make them pass.

## Chunk 3: Verification and review

### Task 5: Run focused verification and document the result

**Files:**
- Modify: `tasks/todo.md`

- [ ] Step 1: Run focused frontend Cron tests.
- [ ] Step 2: Run focused backend cron restriction tests.
- [ ] Step 3: Run frontend typecheck/build if the targeted suites pass.
- [ ] Step 4: Record the review summary and verification commands in `tasks/todo.md`.
