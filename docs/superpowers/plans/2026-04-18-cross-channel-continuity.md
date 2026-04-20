# Cross-Channel Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow conversations to span channels — handoff from Telegram to web, send completion notifications across channels, and provide a unified inbox view.

**Architecture:** Session handoff updates the `gateway_sessions` table to share a `conversation_id` across channels. Cross-channel notifications use the existing `GatewayDeliveryHandle` (via a new `send_direct` method) to push a message to a channel adapter after run completion. Unified inbox queries `gateway_sessions` + `messages` and tracks read state in a new `inbox_reads` table. The `notify_on_complete` field is stored on `runtime_runs` so it survives queued/restart scenarios.

**Tech Stack:** Rust (axum, sqlx), existing gateway adapters, React, TypeScript, Tailwind

**Codebase notes collected during planning:**
- Migration file is `crates/common/migrations/001_init.sql` (consolidated schema — all tables live here; new tables append to the bottom).
- `gateway_sessions` schema: `(id, channel_id, sender_id, conversation_id, last_active, last_run_id, last_delivery_at, last_error)` with `UNIQUE(channel_id, sender_id)`.
- `runtime_runs` already has `channel_id`, `sender_id`, `gateway_session_id` columns — good place to store `notify_on_complete` JSON.
- `GatewayDeliveryHandle` in `crates/gateway/src/delivery.rs` has `enqueue(DeliveryJob)` with a `DeliveryJob::Final` variant that takes `channel_id`, `recipient`, `gateway_session_id`, `run_id`, `message` (OutgoingMessage). We will add a `send_direct` convenience method.
- `GatewayControl` is available on `AppState` via `state.gateway_control` — already has `inner.delivery`.
- `SessionManager` in `crates/gateway/src/session.rs` exposes `get_or_create` and direct `sqlx` query patterns — we follow the same pattern for handoff queries.
- Sidebar uses `usePendingApprovalsCount` hook pattern (badge on nav item) — inbox badge follows the same pattern.
- `navigation.ts` `SIDEBAR_GROUPS` shows the `messages` nav item (`id: 'messages'`) is the natural home for the inbox badge.
- `AppState` is in `crates/server/src/state.rs`; routes register in `crates/server/src/lib.rs`.
- `crates/server/src/routes/mod.rs` lists all route modules; new modules must be added there.
- `create_run` in `runs.rs` uses `submit_http_run` — the notify field will be added alongside the existing `CreateRunRequest`.

---

## Task 1: DB migration — `inbox_reads` table and `notify_on_complete` column

**Files:**
- Modify: `crates/common/migrations/001_init.sql` (append to bottom)

**Steps:**

- [ ] 1. Append the following SQL block to the bottom of `crates/common/migrations/001_init.sql`:

```sql
-- ─── Inbox Reads ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inbox_reads (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    last_read_at TEXT NOT NULL,
    UNIQUE(channel_id, sender_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_reads_sender ON inbox_reads(sender_id);

-- ─── Notify-on-complete (cross-channel run notifications) ────────────────────
-- Stored as JSON in runtime_runs so it survives queuing. Schema:
-- { "channel": "telegram", "recipient_id": "123", "message_template": "..." }
-- Column added conditionally so existing databases are not broken during dev.
-- In SQLite, ALTER TABLE ADD COLUMN is safe to run multiple times if wrapped
-- in application-level migration logic; the IF NOT EXISTS guard is handled
-- by the app's sqlx migrate runner.
ALTER TABLE runtime_runs ADD COLUMN notify_on_complete TEXT;
```

> **Note:** SQLite does not support `ADD COLUMN IF NOT EXISTS`. The consolidated migration file is the authoritative schema; this append is correct for fresh databases. For existing dev databases, run `ALTER TABLE runtime_runs ADD COLUMN notify_on_complete TEXT;` manually in the SQLite shell if needed, or wipe and re-create.

- [ ] 2. Run `cargo test -p rushdino-common` to verify the schema compiles and all existing tests pass.
- [ ] 3. Commit with message: `feat(db): add inbox_reads table and notify_on_complete column`.

---

## Task 2: Session handoff endpoint — `POST /api/sessions/handoff`

**Files:**
- Create: `crates/server/src/routes/channel_handoff.rs`
- Modify: `crates/server/src/routes/mod.rs` — add `pub mod channel_handoff;`
- Modify: `crates/server/src/lib.rs` — register route `.route("/api/sessions/handoff", post(routes::channel_handoff::session_handoff))`

**Overview:** Looks up the `conversation_id` for `(from_channel, from_sender_id)` in `gateway_sessions`, then upserts a new row for `(to_channel, to_sender_id)` sharing the same `conversation_id`. Returns the conversation ID and a deep-link URL the UI can display.

**Steps:**

- [ ] 1. Create `crates/server/src/routes/channel_handoff.rs` with the following content:

```rust
//! POST /api/sessions/handoff
//!
//! Links a conversation started on one channel (e.g. Telegram) to a second
//! channel (e.g. webchat) so both endpoints share the same conversation_id.

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use rushdino_common::{AppError, Result};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffRequest {
    /// The channel where the conversation was originally started, e.g. "telegram".
    pub from_channel: String,
    /// The sender identity on `from_channel`.
    pub from_sender_id: String,
    /// The channel to hand off to, e.g. "webchat".
    pub to_channel: String,
    /// The sender identity on `to_channel`. Defaults to `from_sender_id` when absent.
    pub to_sender_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffResponse {
    /// Shared conversation ID that both channel sessions now point to.
    pub conversation_id: String,
    /// Deep-link URL the web UI can open directly.
    pub handoff_url: String,
}

pub async fn session_handoff(
    State(state): State<AppState>,
    Json(req): Json<HandoffRequest>,
) -> Result<Json<HandoffResponse>> {
    let pool = state.runtime.pool();

    // 1. Look up the source session.
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT conversation_id FROM gateway_sessions \
         WHERE channel_id = ? AND sender_id = ? LIMIT 1",
    )
    .bind(&req.from_channel)
    .bind(&req.from_sender_id)
    .fetch_optional(pool)
    .await?;

    let conversation_id = row
        .map(|(cid,)| cid)
        .ok_or_else(|| {
            AppError::NotFound(format!(
                "no gateway session found for channel='{}' sender='{}'",
                req.from_channel, req.from_sender_id
            ))
        })?;

    // 2. Upsert destination session sharing the same conversation_id.
    let to_sender_id = req
        .to_sender_id
        .unwrap_or_else(|| req.from_sender_id.clone());
    let new_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO gateway_sessions \
             (id, channel_id, sender_id, conversation_id, last_active) \
         VALUES (?, ?, ?, ?, ?) \
         ON CONFLICT(channel_id, sender_id) \
         DO UPDATE SET conversation_id = excluded.conversation_id,
                       last_active = excluded.last_active",
    )
    .bind(&new_id)
    .bind(&req.to_channel)
    .bind(&to_sender_id)
    .bind(&conversation_id)
    .bind(&now)
    .execute(pool)
    .await?;

    let handoff_url = format!("/chat/{}", conversation_id);

    Ok(Json(HandoffResponse {
        conversation_id,
        handoff_url,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::{Request, StatusCode}};
    use tower::ServiceExt;

    // Integration test helpers live in crates/server/src/test_helpers.rs
    // (or inline here if that module does not exist yet).
    //
    // The test below is a doc-level specification; wire it up once the server
    // test harness (build_test_app) is available.
    //
    // Pseudo-test:
    //   1. Insert a gateway_session row for ("telegram", "user1", "conv-abc").
    //   2. POST /api/sessions/handoff { from_channel: "telegram",
    //        from_sender_id: "user1", to_channel: "webchat" }
    //   3. Assert response.conversation_id == "conv-abc"
    //   4. Assert gateway_sessions WHERE channel_id='webchat' AND sender_id='user1'
    //        has conversation_id == "conv-abc"
    #[test]
    fn handoff_request_deserializes() {
        let json = r#"{
            "fromChannel": "telegram",
            "fromSenderId": "user1",
            "toChannel": "webchat"
        }"#;
        let req: HandoffRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.from_channel, "telegram");
        assert_eq!(req.to_sender_id, None);
    }
}
```

- [ ] 2. In `crates/server/src/routes/mod.rs`, add the line `pub mod channel_handoff;` (alphabetical placement, after `pub mod channel_pairing;`).

- [ ] 3. In `crates/server/src/lib.rs`, inside the `Router::new()` chain (near the other `post` routes), add:

```rust
.route(
    "/api/sessions/handoff",
    post(routes::channel_handoff::session_handoff),
)
```

- [ ] 4. Verify `state.runtime.pool()` is accessible. If `RuntimeState` does not expose a `pool()` method, add one in `crates/server/src/runtime_state.rs`:

```rust
pub fn pool(&self) -> &sqlx::SqlitePool {
    &self.pool
}
```

  Alternatively, pass the pool through `AppState` directly — check `state.rs` for the right accessor pattern; the existing `gateway` route already uses `state.gateway_sessions` (which wraps the pool). Follow whichever pattern is already established.

- [ ] 5. Run `cargo build -p rushdino-server` and fix any compilation errors.
- [ ] 6. Run `cargo test -p rushdino-server` and verify PASS.
- [ ] 7. Commit with message: `feat(api): add POST /api/sessions/handoff for cross-channel session linking`.

---

## Task 3: Cross-channel notification on run completion

**Files:**
- Modify: `crates/agent/src/runtime/service.rs` (or wherever `AssistantRunParams` is defined) — add `notify_on_complete` field
- Modify: `crates/server/src/routes/runs.rs` — accept `notify_on_complete` in `CreateRunRequest`, persist it
- Modify: `crates/agent/src/engine_assistant_runs.rs` — dispatch notification after `mark_completed`
- Modify: `crates/gateway/src/delivery.rs` — add `send_direct` convenience method to `GatewayDeliveryHandle`
- Modify: `crates/server/src/state.rs` / `AppState` — expose `gateway_control` to the engine (or pass delivery handle differently — see approach below)

**Architecture decision:** The engine (`AgentEngine`) does not currently hold a reference to the gateway delivery handle. The cleanest minimal-impact approach is:

1. Store `notify_on_complete` JSON in `runtime_runs.notify_on_complete` when the run is created.
2. After `mark_completed` succeeds, the server-side `create_run` route receives the `result_rx` oneshot. But `submit_http_run` is fire-and-forget; the gateway run path (`submit_gateway_run`) already has the full `gateway_event_tx` machinery.
3. Simpler approach: add an **axum background task** spawned in the `create_run` route that awaits the `result_rx` receiver and then dispatches the notification via `state.gateway_control`. This keeps the engine clean and avoids threading delivery handle through the entire agent stack.

**Steps:**

- [ ] 1. Add `NotificationTarget` struct and `notify_on_complete` to `CreateRunRequest` in `crates/server/src/routes/runs.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationTarget {
    /// Channel to send the notification on: "telegram", "discord", "slack", "webchat".
    pub channel: String,
    /// Recipient ID on that channel (e.g. Telegram chat_id or Discord user_id).
    pub recipient_id: String,
    /// Optional message template. Supports {run_id} placeholder.
    /// Defaults to "✅ Run completed: {run_id}"
    pub message_template: Option<String>,
}

impl NotificationTarget {
    pub fn format_message(&self, run_id: &str, summary: &str) -> String {
        let template = self
            .message_template
            .as_deref()
            .unwrap_or("✅ Run completed: {run_id}\n\n{summary}");
        template
            .replace("{run_id}", run_id)
            .replace("{summary}", summary)
    }
}
```

Update `CreateRunRequest`:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRunRequest {
    pub message: String,
    pub conversation_id: Option<String>,
    pub session_id: Option<String>,
    /// When set, the backend sends a message on this channel after run completion.
    pub notify_on_complete: Option<NotificationTarget>,
}
```

- [ ] 2. Add a `send_direct` method to `GatewayDeliveryHandle` in `crates/gateway/src/delivery.rs`:

```rust
/// Send a plain-text message directly to a recipient on the named channel
/// without a pre-existing gateway session.  Creates a synthetic session ID.
pub async fn send_direct(
    &self,
    channel_id: &str,
    recipient: &str,
    text: String,
) -> Result<()> {
    // Use a synthetic gateway session ID — the delivery worker only uses it
    // for the session record update, which is a no-op when the session does not exist.
    let synthetic_session_id = format!("notify-{}-{}", channel_id, recipient);
    let run_id = format!("notify-{}", uuid::Uuid::new_v4());
    self.enqueue(DeliveryJob::Final {
        channel_id: channel_id.to_owned(),
        recipient: recipient.to_owned(),
        gateway_session_id: synthetic_session_id,
        run_id,
        message: OutgoingMessage::text(text),
    })
    .await
}
```

  Verify that `OutgoingMessage::text(...)` exists in `crates/gateway/src/message.rs`. If the constructor is named differently (e.g. `OutgoingMessage { text, .. }` struct literal), adjust accordingly.

- [ ] 3. Expose `gateway_control` on `AppState` for use in route handlers. Check whether `state.gateway_control` is already accessible. Looking at `state.rs`, `AppState` has `gateway_control: GatewayControl` — confirm with a quick grep; if the field is private, make it `pub`.

- [ ] 4. Update the `create_run` handler in `crates/server/src/routes/runs.rs` to spawn a background notification task:

```rust
pub async fn create_run(
    State(state): State<AppState>,
    Json(payload): Json<CreateRunRequest>,
) -> Result<Json<RunSnapshot>> {
    let engine = state.engine()?;
    let session_id = payload
        .session_id
        .unwrap_or_else(|| format!("ui-run-{}", Uuid::new_v4()));
    let (run, result_rx) = engine
        .submit_http_run(&session_id, payload.conversation_id, &payload.message)
        .await?;

    // Spawn background notification if requested.
    if let Some(target) = payload.notify_on_complete {
        let run_id = run.id.clone();
        let delivery = state.gateway_control.inner.delivery.clone();
        tokio::spawn(async move {
            match result_rx.await {
                Ok(Ok(response)) => {
                    let text = target.format_message(&run_id, &response.content);
                    if let Err(err) = delivery
                        .send_direct(&target.channel, &target.recipient_id, text)
                        .await
                    {
                        tracing::warn!(
                            run_id = %run_id,
                            channel = %target.channel,
                            "cross-channel notification failed: {err}"
                        );
                    }
                }
                Ok(Err(reason)) => {
                    tracing::debug!(run_id = %run_id, "run did not complete successfully ({reason}), skipping notification");
                }
                Err(_) => {
                    tracing::debug!(run_id = %run_id, "notification receiver dropped");
                }
            }
        });
    } else {
        // Drop result_rx cleanly when no notification is needed.
        drop(result_rx);
    }

    Ok(Json(run))
}
```

  **Note:** `GatewayControlInner` has `delivery` as a private field. Add a `pub fn delivery(&self) -> &GatewayDeliveryHandle` accessor to `GatewayControl` in `crates/gateway/src/gateway.rs`, or make `inner` pub(crate). Prefer adding an accessor.

- [ ] 5. Add `pub fn delivery(&self) -> &GatewayDeliveryHandle` to `GatewayControl` in `crates/gateway/src/gateway.rs`:

```rust
/// Access the delivery handle for direct notification dispatch.
pub fn delivery(&self) -> &GatewayDeliveryHandle {
    &self.inner.delivery
}
```

  Then update the spawned task in the route to use `state.gateway_control.delivery().clone()`.

- [ ] 6. Run `cargo build -p rushdino-server` and fix any compilation errors.
- [ ] 7. Run `cargo test -p rushdino-server` and verify PASS.
- [ ] 8. Manual smoke test: start the server, submit a run with `notify_on_complete: { channel: "webchat", recipient_id: "test-user" }`, verify log output shows notification dispatched (or fails gracefully if webchat adapter does not handle synthetic session IDs).
- [ ] 9. Commit with message: `feat(api): add notify_on_complete cross-channel notification on run completion`.

---

## Task 4: Unified inbox endpoint — `GET /api/inbox`

**Files:**
- Create: `crates/server/src/routes/inbox.rs`
- Modify: `crates/server/src/routes/mod.rs` — add `pub mod inbox;`
- Modify: `crates/server/src/lib.rs` — register routes

**Overview:** Returns unread message counts per channel for a given `sender_id`. Joins `gateway_sessions` (to find which channel+conversation a sender has) with `messages` (to count messages after `inbox_reads.last_read_at`).

**Steps:**

- [ ] 1. Create `crates/server/src/routes/inbox.rs`:

```rust
//! GET  /api/inbox?sender_id=X       — list unread counts per channel
//! POST /api/inbox/read               — mark a channel as read

use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use rushdino_common::{AppError, Result};

use crate::state::AppState;

// ── Request/response types ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxParams {
    /// Identifies the human sender across all channels (e.g. Telegram user ID).
    pub sender_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxChannel {
    pub channel_id: String,
    pub conversation_id: String,
    /// Number of messages newer than the last read timestamp.
    pub unread_count: i64,
    /// Preview text of the most recent unread message, if any.
    pub last_message: Option<String>,
    /// RFC-3339 timestamp of the most recent unread message.
    pub last_message_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkReadRequest {
    pub channel_id: String,
    pub sender_id: String,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/// GET /api/inbox?sender_id=X
///
/// Returns one entry per channel the sender has an active gateway session on,
/// with the count of messages posted after the last-read timestamp.
pub async fn get_inbox(
    Query(params): Query<InboxParams>,
    State(state): State<AppState>,
) -> Result<Json<Vec<InboxChannel>>> {
    if params.sender_id.is_empty() {
        return Err(AppError::Validation("sender_id is required".to_owned()));
    }

    let pool = state.runtime.pool();

    // Step 1: find all gateway sessions for this sender.
    let sessions: Vec<(String, String)> = sqlx::query_as(
        "SELECT channel_id, conversation_id FROM gateway_sessions WHERE sender_id = ?",
    )
    .bind(&params.sender_id)
    .fetch_all(pool)
    .await?;

    if sessions.is_empty() {
        return Ok(Json(vec![]));
    }

    let mut result = Vec::with_capacity(sessions.len());

    for (channel_id, conversation_id) in sessions {
        // Step 2: find last_read_at for this (channel, sender) pair.
        let last_read_at: Option<(String,)> = sqlx::query_as(
            "SELECT last_read_at FROM inbox_reads \
             WHERE channel_id = ? AND sender_id = ? LIMIT 1",
        )
        .bind(&channel_id)
        .bind(&params.sender_id)
        .fetch_optional(pool)
        .await?;

        // Step 3: count and fetch latest unread message from that conversation.
        let (unread_count, last_message, last_message_at): (i64, Option<String>, Option<String>) =
            if let Some((lr,)) = last_read_at {
                sqlx::query_as(
                    "SELECT COUNT(*), \
                            (SELECT content FROM messages \
                             WHERE conversation_id = ? AND created_at > ? \
                             ORDER BY created_at DESC LIMIT 1), \
                            (SELECT created_at FROM messages \
                             WHERE conversation_id = ? AND created_at > ? \
                             ORDER BY created_at DESC LIMIT 1) \
                     FROM messages \
                     WHERE conversation_id = ? AND created_at > ?",
                )
                .bind(&conversation_id)
                .bind(&lr)
                .bind(&conversation_id)
                .bind(&lr)
                .bind(&conversation_id)
                .bind(&lr)
                .fetch_one(pool)
                .await
                .unwrap_or((0, None, None))
            } else {
                // Never read — all messages are unread.
                sqlx::query_as(
                    "SELECT COUNT(*), \
                            (SELECT content FROM messages \
                             WHERE conversation_id = ? \
                             ORDER BY created_at DESC LIMIT 1), \
                            (SELECT created_at FROM messages \
                             WHERE conversation_id = ? \
                             ORDER BY created_at DESC LIMIT 1) \
                     FROM messages \
                     WHERE conversation_id = ?",
                )
                .bind(&conversation_id)
                .bind(&conversation_id)
                .bind(&conversation_id)
                .fetch_one(pool)
                .await
                .unwrap_or((0, None, None))
            };

        result.push(InboxChannel {
            channel_id,
            conversation_id,
            unread_count,
            // Truncate preview to 120 chars.
            last_message: last_message.map(|m| {
                let trimmed = m.trim().to_owned();
                if trimmed.chars().count() > 120 {
                    trimmed.chars().take(120).collect::<String>() + "..."
                } else {
                    trimmed
                }
            }),
            last_message_at,
        });
    }

    Ok(Json(result))
}

/// POST /api/inbox/read
///
/// Upserts `inbox_reads` for `(channel_id, sender_id)` with `last_read_at = now()`.
/// Subsequent calls to `GET /api/inbox` for this sender will show 0 unread for the channel.
pub async fn mark_inbox_read(
    State(state): State<AppState>,
    Json(req): Json<MarkReadRequest>,
) -> Result<Json<serde_json::Value>> {
    if req.channel_id.is_empty() || req.sender_id.is_empty() {
        return Err(AppError::Validation(
            "channel_id and sender_id are required".to_owned(),
        ));
    }

    let pool = state.runtime.pool();
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO inbox_reads (id, channel_id, sender_id, last_read_at) \
         VALUES (?, ?, ?, ?) \
         ON CONFLICT(channel_id, sender_id) \
         DO UPDATE SET last_read_at = excluded.last_read_at",
    )
    .bind(&id)
    .bind(&req.channel_id)
    .bind(&req.sender_id)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inbox_channel_serializes() {
        let ch = InboxChannel {
            channel_id: "telegram".to_owned(),
            conversation_id: "main::telegram".to_owned(),
            unread_count: 3,
            last_message: Some("Hello".to_owned()),
            last_message_at: Some("2026-04-18T10:00:00Z".to_owned()),
        };
        let json = serde_json::to_string(&ch).unwrap();
        assert!(json.contains("unreadCount"));
        assert!(json.contains("lastMessage"));
    }

    #[test]
    fn mark_read_request_deserializes() {
        let json = r#"{"channelId":"telegram","senderId":"user1"}"#;
        let req: MarkReadRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.channel_id, "telegram");
    }
}
```

- [ ] 2. In `crates/server/src/routes/mod.rs`, add `pub mod inbox;`.

- [ ] 3. In `crates/server/src/lib.rs`, register both routes inside `Router::new()`:

```rust
.route(
    "/api/inbox",
    get(routes::inbox::get_inbox),
)
.route(
    "/api/inbox/read",
    post(routes::inbox::mark_inbox_read),
)
```

- [ ] 4. Ensure `state.runtime.pool()` is accessible (see Task 2, step 4 note).
- [ ] 5. Run `cargo build -p rushdino-server` and fix any compilation errors.
- [ ] 6. Run `cargo test -p rushdino-server` and verify PASS.
- [ ] 7. Commit with message: `feat(api): add GET /api/inbox and POST /api/inbox/read endpoints`.

---

## Task 5: Frontend — Inbox API client

**Files:**
- Create: `frontend/src/lib/api/inbox.ts`

**Steps:**

- [ ] 1. Create `frontend/src/lib/api/inbox.ts`:

```typescript
// Unified inbox API client — cross-channel unread message counts.

import { parseJsonOrThrow } from './client';

export interface InboxChannel {
  channelId: string;
  conversationId: string;
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

/**
 * Fetch unread message counts across all channels for the given sender.
 * Returns an empty array when the sender has no active gateway sessions.
 */
export async function getInbox(senderId: string): Promise<InboxChannel[]> {
  const endpoint = `/api/inbox?sender_id=${encodeURIComponent(senderId)}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return Array.isArray(data) ? data : [];
}

/**
 * Mark a channel's inbox as read for the given sender.
 * Subsequent calls to getInbox() will return 0 unread for this channel.
 */
export async function markInboxRead(
  channelId: string,
  senderId: string,
): Promise<void> {
  const endpoint = '/api/inbox/read';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId, senderId }),
  });
  await parseJsonOrThrow(response, endpoint);
}
```

- [ ] 2. Run `cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit` to verify no TypeScript errors.
- [ ] 3. Commit with message: `feat(frontend): add inbox API client`.

---

## Task 6: Frontend — `InboxBadge` component and sidebar integration

**Files:**
- Create: `frontend/src/components/sidebar/inbox-badge.tsx`
- Modify: `frontend/src/components/sidebar/sidebar.tsx` — import and render `<InboxBadge>`
- Modify: `frontend/src/lib/navigation.ts` — ensure `messages` item is not `hidden`

**Steps:**

- [ ] 1. Create `frontend/src/components/sidebar/inbox-badge.tsx`:

```tsx
// InboxBadge — displays total unread count across all channels.
// Polls /api/inbox every 30 seconds and shows a red badge when unread > 0.

import { useQuery } from '@tanstack/react-query';
import { getInbox } from '@/lib/api/inbox';

interface InboxBadgeProps {
  /** Sender ID to query — typically the connected channel user ID. */
  senderId: string;
  /** Override className for the badge element (optional). */
  className?: string;
}

/**
 * Red badge that shows the total unread count across all gateway channels.
 * Returns null (renders nothing) when there are no unread messages.
 */
export function InboxBadge({ senderId, className }: InboxBadgeProps) {
  const { data } = useQuery({
    queryKey: ['inbox', senderId],
    queryFn: () => getInbox(senderId),
    // Poll every 30 seconds so the badge stays current without websocket overhead.
    refetchInterval: 30_000,
    // Don't retry aggressively on error — inbox is non-critical.
    retry: 1,
  });

  const totalUnread = data?.reduce((sum, ch) => sum + ch.unreadCount, 0) ?? 0;

  if (totalUnread === 0) return null;

  return (
    <span
      className={
        className ??
        'ml-auto shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground'
      }
    >
      {totalUnread > 99 ? '99+' : totalUnread}
    </span>
  );
}
```

- [ ] 2. In `frontend/src/lib/navigation.ts`, change the `messages` item to remove the `hidden: true` flag so the inbox is visible in the sidebar:

```typescript
// Before:
{ id: 'messages', label: 'Messages', icon: Mail, href: '/messages', matchPrefix: '/messages', advancedOnly: true },

// After (no hidden flag):
{ id: 'messages', label: 'Inbox', icon: Mail, href: '/messages', matchPrefix: '/messages', advancedOnly: true },
```

  > Rename label from "Messages" to "Inbox" for clarity since this is now the cross-channel inbox.

- [ ] 3. Modify `frontend/src/components/sidebar/sidebar.tsx` to render `<InboxBadge>` next to the `messages` nav item.

  The `SidebarNavItem` component already handles a `badge` prop for the approvals count. The cleanest approach that preserves the existing pattern is to add an `inboxUnread` prop analogous to `pendingApprovalsCount`, and render it for the `messages` item:

  a. Import `InboxBadge` at the top:
  ```tsx
  import { InboxBadge } from './inbox-badge';
  ```

  b. In `SidebarNavItem`, the badge is already computed as:
  ```tsx
  const badge = item.id === 'approvals' && pendingApprovalsCount > 0 ? pendingApprovalsCount : null;
  ```

  Rather than threading a separate `inboxUnread` count through `SidebarNavItem` (which would change the prop interface), place the `InboxBadge` component directly inside the sidebar render loop for the `messages` item. The simplest change: replace the `badge` logic in `SidebarNavItem` with a more general `badgeContent` that can accept a ReactNode, OR simply render `<InboxBadge>` inline in `Sidebar` for the messages item.

  **Recommended minimal change** — update the `SidebarNavItem` badge line to also handle the `messages` item using a static sender ID (the gateway sender for the local user). Since the local instance has a single user, use a well-known default sender ID (e.g. `"local"`) or make `senderId` a prop. For now, use `"local"` as the default:

  In `SidebarNavItem` props, add:
  ```tsx
  inboxUnread?: number;
  ```

  In the `badge` computation:
  ```tsx
  const badge =
    (item.id === 'approvals' && pendingApprovalsCount > 0 ? pendingApprovalsCount : null) ??
    (item.id === 'messages' && (inboxUnread ?? 0) > 0 ? inboxUnread! : null);
  ```

  In `Sidebar`, add a `useInboxCount` helper or inline `useQuery`:
  ```tsx
  import { useQuery } from '@tanstack/react-query';
  import { getInbox } from '@/lib/api/inbox';

  // Inside the Sidebar component:
  const { data: inboxData } = useQuery({
    queryKey: ['inbox', 'local'],
    queryFn: () => getInbox('local'),
    refetchInterval: 30_000,
    retry: 1,
  });
  const inboxUnreadCount = inboxData?.reduce((sum, ch) => sum + ch.unreadCount, 0) ?? 0;
  ```

  Pass `inboxUnread={inboxUnreadCount}` to each `SidebarNavItem`.

  > **Design note:** The `senderId: "local"` is a placeholder. In production the gateway sender ID is set by the channel adapter (e.g. Telegram user ID). A future improvement would store the paired sender ID in localStorage after channel pairing and read it here. For this plan, `"local"` provides functional behavior for the web-only inbox.

- [ ] 4. Full diff of `sidebar.tsx` changes summary:
  - Add `inboxUnread?: number` to `SidebarNavItemProps`.
  - Update `badge` computation to handle `messages` item.
  - Add `useQuery` import and inbox query in `Sidebar` component body.
  - Pass `inboxUnread={inboxUnreadCount}` to `SidebarNavItem` calls.

- [ ] 5. Run `cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit` to verify no TypeScript errors.
- [ ] 6. Verify the sidebar renders the badge: open the dev server, check the sidebar's "Inbox" item shows a red badge when there are unread messages (create a test gateway session + message in SQLite to validate).
- [ ] 7. Commit with message: `feat(frontend): add inbox badge to sidebar with 30s polling`.

---

## Task 7: Frontend — "Open in web" link for active gateway sessions (optional enhancement)

**Files:**
- Modify: `frontend/src/components/` (gateway sessions page or a new component)

**Steps:**

- [ ] 1. In the Gateway page (`/gateway`), find where gateway sessions are listed (likely `frontend/src/components/` under a gateway or channel view).
- [ ] 2. For each session that has a `conversation_id`, add an "Open in web" button or link that navigates to `/chat/{conversation_id}`.
- [ ] 3. Optionally, call `POST /api/sessions/handoff` before navigating to ensure the webchat session is linked to the same conversation.
- [ ] 4. Run `cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit` and verify PASS.
- [ ] 5. Commit with message: `feat(frontend): add Open in web link for active gateway sessions`.

---

## Acceptance Criteria

| Feature | Criterion |
|---------|-----------|
| Session handoff | `POST /api/sessions/handoff` returns `conversation_id` and both `gateway_sessions` rows share it |
| Session handoff | Returns 404 when `from_channel`/`from_sender_id` has no existing session |
| Cross-channel notification | Run created with `notify_on_complete` dispatches a message to the target channel after completion |
| Cross-channel notification | Notification is skipped (logged at debug) when run fails or is aborted |
| Unified inbox | `GET /api/inbox?sender_id=X` returns one entry per channel with correct `unread_count` |
| Unified inbox | `POST /api/inbox/read` resets unread count to 0 for the given channel |
| Inbox badge | Badge appears in sidebar next to "Inbox" nav item when unread > 0 |
| Inbox badge | Badge shows `99+` when total unread exceeds 99 |
| Inbox badge | Badge disappears when all channels are marked read |

---

## Known Constraints & Edge Cases

- **SQLite `ALTER TABLE ADD COLUMN`** does not support `IF NOT EXISTS`. Fresh installs work via the migration; existing dev databases need a manual one-time `ALTER TABLE`.
- **`send_direct` with synthetic session ID**: the `DeliveryWorker` updates `gateway_sessions` on delivery. If the synthetic session ID does not map to a real row, the update is a no-op — acceptable for notification-only messages.
- **`senderId: "local"`** in the frontend is a placeholder. Full multi-user inbox requires reading the paired sender ID from context (e.g. from channel pairing flow or localStorage).
- **`result_rx` drop**: when `notify_on_complete` is absent, `result_rx` is explicitly dropped to avoid the oneshot sender receiving a "closed" error that would cause a spurious log warning.
- **`GatewayDeliveryHandle::send_direct`** requires `uuid` as a dependency in `rushdino-gateway`. Verify `Cargo.toml` already includes `uuid` (it does — `SessionManager::get_or_create` uses it).
