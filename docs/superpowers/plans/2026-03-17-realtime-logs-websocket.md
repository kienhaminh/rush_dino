# Realtime Logs WebSocket Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace polling-based live logs with true WebSocket-pushed runtime log events while keeping `/api/logs` for initial history and reconnect recovery.

**Architecture:** Reuse the existing `ChatBroadcastHub` and dashboard WebSocket, broadening runtime-log broadcasting from error-only to all levels. Keep the frontend Logs page model intact, but source incremental updates from the shared WebSocket path and use `/api/logs` only for bootstrap/reconnect backfill.

**Tech Stack:** React, TypeScript, Vitest, Rust, Axum, tokio broadcast, SQLite

---

## Chunk 1: Backend runtime log broadcast

### Task 1: Add failing backend coverage for all-level runtime log broadcast

**Files:**
- Modify: `crates/server/src/runtime_log_store.rs`
- Modify: `crates/server/src/chat_broadcast.rs`

- [ ] Step 1: Add a backend test that inserts a non-error runtime log and expects a `runtime_log` broadcast event.
- [ ] Step 2: Run the focused Rust test and confirm it fails before the broadcast change.

### Task 2: Broadcast every runtime log entry through the shared WebSocket hub

**Files:**
- Modify: `crates/server/src/runtime_log_store.rs`
- Modify: `crates/server/src/chat_broadcast.rs`

- [ ] Step 1: Add a general runtime-log broadcast method with a stable payload shape.
- [ ] Step 2: Call it from `RuntimeLogStore::insert(...)` after SQLite persistence.
- [ ] Step 3: Re-run the focused Rust test and make it pass.

## Chunk 2: Frontend live logs subscription

### Task 3: Add failing frontend coverage for runtime log WebSocket events

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/pages/logs/LogsPage.tsx`
- Add: `frontend/src/pages/logs/logs-page.node.test.tsx`

- [ ] Step 1: Add a frontend test that feeds a `runtime_log` event into the Logs page path and expects the new entry to appear without polling.
- [ ] Step 2: Run the focused frontend test command and confirm it fails before the subscription code exists.

### Task 4: Replace polling live updates with WebSocket-driven append

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/hooks/use-websocket.ts`
- Modify: `frontend/src/pages/logs/LogsPage.tsx`

- [ ] Step 1: Add the `runtime_log` WebSocket event type to shared frontend types.
- [ ] Step 2: Subscribe the Logs page to shared WebSocket log events and append/dedupe entries locally.
- [ ] Step 3: Keep `/api/logs` for initial load and reconnect backfill only.
- [ ] Step 4: Re-run the focused frontend logs test and make it pass.

## Chunk 3: Verification and review

### Task 5: Run focused verification and document the result

**Files:**
- Modify: `tasks/todo.md`

- [ ] Step 1: Run the focused backend runtime-log broadcast test.
- [ ] Step 2: Run the focused frontend logs test.
- [ ] Step 3: Run frontend typecheck/build if the targeted suites pass.
- [ ] Step 4: Record the implementation summary and verification commands in `tasks/todo.md`.
