# Approvals Page — Design Spec

**Date:** 2026-03-30
**Status:** Approved for implementation

---

## Context

After refactoring the Gateway page, there is no longer a UI surface for approving or denying channel pairing requests (Telegram/Discord users wanting to connect). Pending pairing requests accumulate in the database with no way for the workspace owner to action them.

The goal is a dedicated **Approvals page** that surfaces all pending channel pairing requests as a queue — the single place a user goes to review and act on incoming external-channel access requests.

Guardrail approvals and agent-generated `request_user_input` forms remain in their existing conversation-inline flow and are **not** in scope.

---

## Design

### Overview

- New route `/approvals` added to `App.tsx`, rendered under `AppLayout`
- Nav sidebar entry for "Approvals" with a **live badge** showing pending count
- Page aggregates pending requests across all channels (telegram, discord) via existing API endpoints
- Real-time badge updates via a new `pairing_request_created` WebSocket event emitted when a new pairing request is created on the backend
- Approve/Deny actions call the existing REST API (`POST /api/channels/:channel/pairing/:id/decision`)

### Backend Changes

#### 1. `crates/server/src/channel_pairing.rs`

**`create_or_refresh_request()` return type change:**
Return `(PairingPendingRequest, bool)` where `bool = is_new` (true on first insert, false on refresh of an existing pending request). The caller uses this to decide whether to emit a WS event.

**`ChannelPairingIngressPolicy` — add broadcast sender:**
Add `broadcast_tx: tokio::sync::broadcast::Sender<serde_json::Value>` field.
In `ChannelPairingIngressPolicy::new()`, accept it as a parameter.
In `evaluate()` under `DmPolicy::Pairing`: after creating the request, if `is_new`, call `self.broadcast_tx.send(...)` with event type `pairing_request_created` and full request details.

#### 2. `crates/server/src/chat_broadcast.rs`

Add a convenience method:
```rust
pub fn broadcast_pairing_request(&self, request: &PairingPendingRequest) { ... }
```
Emits:
```json
{
  "type": "pairing_request_created",
  "id": "...",
  "channel_id": "...",
  "sender_id": "...",
  "sender_display": "...",
  "code": "...",
  "created_at": "..."
}
```

#### 3. `crates/server/src/lib.rs`

Pass `chat_broadcast.sender()` to `ChannelPairingIngressPolicy::new()`.

No new API endpoints needed — the approvals page uses the existing:
- `GET /api/channels/:channel/pairing`
- `POST /api/channels/:channel/pairing/:id/decision`
- `DELETE /api/channels/:channel/pairing/paired/:sender_id`

### Frontend Changes

#### 1. `frontend/src/pages/approvals/ApprovalsPage.tsx` (new file)

Single-file page component that:
- Fetches `fetchChannelPairing("telegram")` and `fetchChannelPairing("discord")` in parallel
- Merges all `pending` requests into a unified list sorted by `lastSeenAt` desc
- Shows a "Pending Requests" section: one card per request with sender display, channel badge, pairing code (prominent), timestamps, Approve / Deny buttons
- Shows a "Paired" section below with all approved senders and a Revoke button each
- Refetches when `pairing_request_created` WS event arrives (via a context/event from `use-chat-ws`)
- Calls `decidePairingRequest` and `revokePairedSender` from `lib/api.ts`, then refetches

#### 2. `frontend/src/hooks/use-pending-approvals-count.ts` (new file)

A hook that:
- Fetches pending count on mount by calling both pairing endpoints and summing pending lengths
- Subscribes to `pairing_request_created` WS events and increments the count
- Decrements on successful approve/deny from the Approvals page (via invalidation or refetch)
- Returns `{ count: number }`

This hook is used in the sidebar to show a live badge.

#### 3. `frontend/src/lib/navigation.ts`

Add to the `operations` group:
```ts
{ id: 'approvals', label: 'Approvals', icon: CheckSquare, href: '/approvals', matchPrefix: '/approvals' }
```

#### 4. `frontend/src/components/sidebar/sidebar.tsx`

- Add optional badge rendering per item. When the item id is `'approvals'` and count > 0, render a small numeric badge overlay on the icon (or inline next to the label in expanded mode).
- Use `usePendingApprovalsCount()` inside the sidebar to get the live count.

#### 5. `frontend/src/lib/dashboard-routes.ts`

Add a `PageHeader` entry for `/approvals`:
```ts
{ id: 'approvals', title: 'Approvals', subtitle: 'Pending access requests', match: /^\/approvals/ }
```

#### 6. `frontend/src/App.tsx`

Add lazy-loaded import and route:
```tsx
const ApprovalsPage = lazy(() => import('./pages/approvals/ApprovalsPage'))
// ...
<Route path="approvals" element={<ApprovalsPage />} />
```

#### 7. `frontend/src/hooks/use-chat-ws.tsx`

Handle the new `pairing_request_created` WS event type. Rather than adding to the conversation timeline (it's not a chat message), call a registered callback if one is provided. The WS hook is already used in `AppLayout` via `useChatWsConnection()` — add an `onPairingRequest` optional callback parameter so the badge hook can subscribe.

#### 8. `frontend/src/hooks/use-pending-approvals-count.ts`

Implementation detail: registers `onPairingRequest` in `use-chat-ws` to increment its local count without a full refetch. On mount, fetches the initial count from both channels. The count resets/refetches when the user approves or denies a request (passed as a dependency or invalidation token).

---

## Data Flow

```
Telegram/Discord user DMs bot
  → ChannelPairingIngressPolicy::evaluate()
    → create_or_refresh_request() returns (request, is_new=true)
    → broadcast_tx.send(pairing_request_created { ...request })
      → WS clients receive event
        → usePendingApprovalsCount badge increments
        → ApprovalsPage (if open) refetches

User navigates to /approvals
  → Sees pending request
  → Clicks Approve/Deny
    → POST /api/channels/:channel/pairing/:id/decision
    → Page refetches
    → Badge count decrements
```

---

## Verification

1. Start backend; configure Telegram with `dm_policy = "pairing"` in `config.toml`
2. Send a DM from a Telegram account that hasn't paired
3. Verify the sidebar badge increments in real-time (no page refresh)
4. Navigate to `/approvals` — verify the request appears with sender name, code, and timestamps
5. Click Approve — verify request moves to "Paired" section; badge clears
6. Send another DM from a different account; click Deny — verify request disappears
7. Test with Discord channel as well
8. Test with no pending requests — verify badge is hidden (not shown as 0)
