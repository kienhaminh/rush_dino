# Approvals Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated `/approvals` page with a live-badged sidebar entry that shows all pending channel pairing requests (Telegram/Discord) as an approve/deny queue.

**Architecture:** The backend emits a `pairing_request_created` WebSocket broadcast when a genuinely new pairing request is created (not a refresh). The frontend handles this event in `ChatWsProvider` via a counter context, which the sidebar uses to show a live badge without polling, while `ApprovalsPage` uses the existing channel pairing API endpoints to fetch and action requests.

**Tech Stack:** Rust (Axum, SQLite, tokio broadcast), React, TypeScript, Lucide icons, shadcn/ui (Badge, Button, Card)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `crates/server/src/channel_pairing.rs` | Modify | Return `(request, is_new)` from `create_or_refresh_request`; add `broadcast_tx` to `ChannelPairingIngressPolicy`; emit WS event on new request |
| `crates/server/src/channel_pairing_tests.rs` | Modify | Update tests for new `(request, is_new)` return type and new `ChannelPairingIngressPolicy::new` signature |
| `crates/server/src/lib.rs` | Modify | Pass `chat_broadcast.sender()` to `ChannelPairingIngressPolicy::new` |
| `frontend/src/hooks/use-chat-ws.tsx` | Modify | Add `PairingRequestContext` with a counter; handle `pairing_request_created` WS event to increment counter |
| `frontend/src/hooks/use-pending-approvals-count.ts` | **Create** | Fetch initial pending count from both channels; subscribe to pairing counter context; return `{ count, refetch }` |
| `frontend/src/pages/approvals/ApprovalsPage.tsx` | **Create** | Fetch both channels, render pending/paired lists, approve/deny/revoke actions |
| `frontend/src/lib/navigation.ts` | Modify | Add `approvals` sidebar item |
| `frontend/src/lib/dashboard-routes.ts` | Modify | Add `resolvePageHeader` case for `/approvals` |
| `frontend/src/App.tsx` | Modify | Add lazy import and route for `ApprovalsPage` |
| `frontend/src/components/sidebar/sidebar.tsx` | Modify | Show live numeric badge on the Approvals item |

---

## Task 1: Backend — `create_or_refresh_request` returns `is_new` flag

**Files:**
- Modify: `crates/server/src/channel_pairing.rs`
- Modify: `crates/server/src/channel_pairing_tests.rs`

- [ ] **Step 1.1: Update `create_or_refresh_request` signature**

In `crates/server/src/channel_pairing.rs`, change the return type from `Result<PairingPendingRequest>` to `Result<(PairingPendingRequest, bool)>`. The bool is `true` when a new row was inserted, `false` on refresh.

Existing refresh path (around line 111–137) currently returns `Ok(existing)`. Change to:
```rust
return Ok((
    self.find_pending_by_sender(channel_id, sender_id)
        .await?
        .ok_or_else(|| AppError::Agent("pairing request disappeared after refresh".to_owned()))?,
    false, // not new
));
```

Existing insert path (around line 140–164) currently returns:
```rust
self.find_pending_by_sender(channel_id, sender_id)
    .await?
    .ok_or_else(|| AppError::Agent("pairing request insert failed".to_owned()))
```
Change to:
```rust
let request = self
    .find_pending_by_sender(channel_id, sender_id)
    .await?
    .ok_or_else(|| AppError::Agent("pairing request insert failed".to_owned()))?;
Ok((request, true)) // new
```

- [ ] **Step 1.2: Fix the call site in `evaluate()`**

In `ChannelPairingIngressPolicy::evaluate()` (around line 464), the call is:
```rust
let request = self
    .pairing
    .create_or_refresh_request(...)
    .await?;
```
Change to:
```rust
let (request, _is_new) = self
    .pairing
    .create_or_refresh_request(...)
    .await?;
```
(We use `_is_new` as a placeholder — Task 2 will use this properly.)

- [ ] **Step 1.3: Fix existing tests for new return type**

In `crates/server/src/channel_pairing_tests.rs`:

Test `pairing_requests_are_reused_for_repeated_sender` (line ~78):
```rust
let (first, first_is_new) = service
    .create_or_refresh_request("telegram", "42", Some("Alice"), "42")
    .await
    .expect("first request");
let (second, second_is_new) = service
    .create_or_refresh_request("telegram", "42", Some("Alice B"), "42")
    .await
    .expect("second request");

assert!(first_is_new, "first request should be new");
assert!(!second_is_new, "second request should be a refresh");
assert_eq!(first.id, second.id);
assert_eq!(first.code, second.code);
assert_eq!(second.sender_display.as_deref(), Some("Alice B"));
```

Test `approving_request_moves_sender_to_paired_list` (line ~95):
```rust
let (request, _) = service
    .create_or_refresh_request("telegram", "42", Some("Alice"), "42")
    .await
    .expect("request");
```

Test `expired_requests_are_pruned` (line ~116):
```rust
let (request, _) = service
    .create_or_refresh_request("telegram", "42", Some("Alice"), "42")
    .await
    .expect("request");
```

- [ ] **Step 1.4: Run backend tests**
```bash
cd /Users/kien.ha/Code/RushDino
cargo test -p rushdino-server channel_pairing 2>&1 | tail -20
```
Expected: all `channel_pairing` tests pass.

- [ ] **Step 1.5: Commit**
```bash
git add crates/server/src/channel_pairing.rs crates/server/src/channel_pairing_tests.rs
git commit -m "refactor: create_or_refresh_request returns (request, is_new) flag"
```

---

## Task 2: Backend — emit `pairing_request_created` WebSocket event

**Files:**
- Modify: `crates/server/src/channel_pairing.rs`
- Modify: `crates/server/src/channel_pairing_tests.rs`
- Modify: `crates/server/src/lib.rs`

- [ ] **Step 2.1: Add `broadcast_tx` field to `ChannelPairingIngressPolicy`**

In `crates/server/src/channel_pairing.rs`, update the struct and constructor:
```rust
pub struct ChannelPairingIngressPolicy {
    config_path: PathBuf,
    pairing: Arc<ChannelPairingService>,
    runtime_logs: Arc<RuntimeLogStore>,
    broadcast_tx: tokio::sync::broadcast::Sender<serde_json::Value>,
}

impl ChannelPairingIngressPolicy {
    pub fn new(
        config_path: PathBuf,
        pairing: Arc<ChannelPairingService>,
        runtime_logs: Arc<RuntimeLogStore>,
        broadcast_tx: tokio::sync::broadcast::Sender<serde_json::Value>,
    ) -> Self {
        Self {
            config_path,
            pairing,
            runtime_logs,
            broadcast_tx,
        }
    }
    // ...existing log_pairing_event method unchanged...
}
```

- [ ] **Step 2.2: Use `is_new` to emit the WS event in `evaluate()`**

Replace the `_is_new` placeholder from Task 1 Step 1.2 with:
```rust
let (request, is_new) = self
    .pairing
    .create_or_refresh_request(
        &msg.channel_id,
        &msg.actor_id,
        msg.actor_display.as_deref(),
        &msg.reply_target,
    )
    .await?;

if is_new {
    let _ = self.broadcast_tx.send(serde_json::json!({
        "type": "pairing_request_created",
        "id": request.id,
        "channel_id": request.channel_id,
        "sender_id": request.sender_id,
        "sender_display": request.sender_display,
        "code": request.code,
        "created_at": request.created_at,
    }));
}
```

- [ ] **Step 2.3: Fix the ingress policy test — add dummy broadcast_tx**

In `crates/server/src/channel_pairing_tests.rs`, the two tests that construct `ChannelPairingIngressPolicy` need a `broadcast_tx`. Add a helper at the top of the test file:
```rust
fn dummy_broadcast_tx() -> tokio::sync::broadcast::Sender<serde_json::Value> {
    tokio::sync::broadcast::channel(1).0
}
```

Update `ingress_policy_blocks_unpaired_direct_messages` (line ~147):
```rust
let policy = ChannelPairingIngressPolicy::new(
    config_path,
    service.clone(),
    logs,
    dummy_broadcast_tx(),
);
```

Update `ingress_policy_allows_manual_allowlist_sender` similarly (find the second `ChannelPairingIngressPolicy::new` call and add `dummy_broadcast_tx()`).

- [ ] **Step 2.4: Update `lib.rs` to pass the broadcast sender**

In `crates/server/src/lib.rs`, find the `ChannelPairingIngressPolicy::new` call (around line 101–105):
```rust
let ingress_policy = Arc::new(ChannelPairingIngressPolicy::new(
    config_path.clone(),
    channel_pairing.clone(),
    runtime_logs.clone(),
));
```
Change to:
```rust
let ingress_policy = Arc::new(ChannelPairingIngressPolicy::new(
    config_path.clone(),
    channel_pairing.clone(),
    runtime_logs.clone(),
    chat_broadcast.sender(),
));
```

- [ ] **Step 2.5: Run backend tests**
```bash
cargo test -p rushdino-server channel_pairing 2>&1 | tail -20
```
Expected: all channel_pairing tests pass.

- [ ] **Step 2.6: Verify full build**
```bash
cargo build 2>&1 | grep -E "^error" | head -20
```
Expected: no errors.

- [ ] **Step 2.7: Commit**
```bash
git add crates/server/src/channel_pairing.rs crates/server/src/channel_pairing_tests.rs crates/server/src/lib.rs
git commit -m "feat: emit pairing_request_created WS event on new channel pairing requests"
```

---

## Task 3: Frontend — WS event handling + pairing request counter context

**Files:**
- Modify: `frontend/src/hooks/use-chat-ws.tsx`

The `ChatWsProvider` handles WS messages. We need to expose a counter that increments each time `pairing_request_created` arrives. Components subscribe to this counter and refetch when it changes.

- [ ] **Step 3.1: Add `PairingRequestContext` to `use-chat-ws.tsx`**

After the existing `ChatWsConnectionContext` definition (around line 26), add:
```tsx
// ---------------------------------------------------------------------------
// Context: pairing request notifications (used by sidebar badge + ApprovalsPage)
// ---------------------------------------------------------------------------

interface PairingRequestValue {
  /** Increments each time a pairing_request_created WS event arrives. */
  pairingRequestCount: number;
}

const PairingRequestContext = createContext<PairingRequestValue>({
  pairingRequestCount: 0,
});
```

- [ ] **Step 3.2: Add state and WS handler inside `ChatWsProvider`**

Inside `ChatWsProvider`, after the `seenErrorLogIdsRef` declaration (around line 82), add:
```tsx
const [pairingRequestCount, setPairingRequestCount] = useState(0);
```

Inside `socket.onmessage`, after the `task_review_ready` handler (around line 385, before the closing `}`), add:
```tsx
// --- pairing_request_created ---
if (msg.type === 'pairing_request_created') {
  setPairingRequestCount((n) => n + 1);
  return;
}
```

Note: `msg.type === 'pairing_request_created'` requires the WS event type to be included in the `WsEvent` union in `src/lib/types.ts`. Add this to `WsEvent` in Step 3.3.

- [ ] **Step 3.3: Add `pairing_request_created` to `WsEvent` union in `frontend/src/lib/types.ts`**

Find the `WsEvent` type in `frontend/src/lib/types.ts` and add this variant:
```ts
| {
    type: 'pairing_request_created';
    id: string;
    channel_id: string;
    sender_id: string;
    sender_display: string | null;
    code: string;
    created_at: string;
  }
```

- [ ] **Step 3.4: Expose the counter via context and hook**

Inside `ChatWsProvider`, compute the context value. Find the `return (` statement (around line 480) and wrap to include the new provider:

First, add the memoized value before `return`:
```tsx
const pairingRequestValue = useMemo(
  () => ({ pairingRequestCount }),
  [pairingRequestCount],
);
```

Then wrap the existing providers:
```tsx
return (
  <ChatWsConnectionContext.Provider value={connectionValue}>
    <PairingRequestContext.Provider value={pairingRequestValue}>
      <ChatWsContext.Provider value={chatValue}>{children}</ChatWsContext.Provider>
    </PairingRequestContext.Provider>
  </ChatWsConnectionContext.Provider>
);
```

At the bottom of the file, export the hook:
```tsx
/** Subscribe to pairing request arrival events (used by sidebar badge). */
export function usePairingRequestEvents() {
  return useContext(PairingRequestContext);
}
```

- [ ] **Step 3.5: Type-check**
```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 3.6: Commit**
```bash
git add frontend/src/hooks/use-chat-ws.tsx frontend/src/lib/types.ts
git commit -m "feat: expose pairingRequestCount context in ChatWsProvider for live badge updates"
```

---

## Task 4: Frontend — `usePendingApprovalsCount` hook

**Files:**
- Create: `frontend/src/hooks/use-pending-approvals-count.ts`

- [ ] **Step 4.1: Create the hook**

Create `frontend/src/hooks/use-pending-approvals-count.ts`:
```ts
import { useCallback, useEffect, useState } from 'react';
import { fetchChannelPairing } from '@/lib/api';
import { usePairingRequestEvents } from '@/hooks/use-chat-ws';

/**
 * Returns the total count of pending pairing requests across all channels.
 * Refetches from the API on mount and when `refetchKey` changes.
 * Increments optimistically when the WS fires `pairing_request_created`.
 */
export function usePendingApprovalsCount(refetchKey?: number) {
  const [count, setCount] = useState(0);
  const { pairingRequestCount } = usePairingRequestEvents();

  const fetchCount = useCallback(async () => {
    try {
      const [telegram, discord] = await Promise.all([
        fetchChannelPairing('telegram'),
        fetchChannelPairing('discord'),
      ]);
      setCount(telegram.pending.length + discord.pending.length);
    } catch {
      // Silently ignore — badge simply won't show
    }
  }, []);

  // Fetch on mount and whenever the caller invalidates (e.g. after approve/deny)
  useEffect(() => {
    fetchCount();
  }, [fetchCount, refetchKey]);

  // Increment optimistically when a new WS event arrives
  useEffect(() => {
    if (pairingRequestCount > 0) {
      setCount((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairingRequestCount]);

  return { count, refetch: fetchCount };
}
```

- [ ] **Step 4.2: Type-check**
```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4.3: Commit**
```bash
git add frontend/src/hooks/use-pending-approvals-count.ts
git commit -m "feat: add usePendingApprovalsCount hook for live sidebar badge"
```

---

## Task 5: Frontend — `ApprovalsPage`

**Files:**
- Create: `frontend/src/pages/approvals/ApprovalsPage.tsx`

- [ ] **Step 5.1: Create the page component**

Create `frontend/src/pages/approvals/ApprovalsPage.tsx`:
```tsx
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchChannelPairing, resolveChannelPairingRequest, revokeChannelPairedUser } from '@/lib/api';
import type { ChannelPairingState, ChannelPairingPendingRequest, ChannelPairedUser } from '@/lib/types';

type Channel = 'telegram' | 'discord';
const CHANNELS: Channel[] = ['telegram', 'discord'];

function channelLabel(channel: Channel) {
  return channel === 'telegram' ? 'Telegram' : 'Discord';
}

function formatTs(value: string) {
  return new Date(value).toLocaleString();
}

export function ApprovalsPage() {
  const [states, setStates] = useState<Record<Channel, ChannelPairingState | null>>({
    telegram: null,
    discord: null,
  });
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    const [telegram, discord] = await Promise.all([
      fetchChannelPairing('telegram'),
      fetchChannelPairing('discord'),
    ]);
    setStates({ telegram, discord });
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const allPending: (ChannelPairingPendingRequest & { channel: Channel })[] = CHANNELS.flatMap(
    (ch) => (states[ch]?.pending ?? []).map((r) => ({ ...r, channel: ch })),
  ).sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

  const allPaired: (ChannelPairedUser & { channel: Channel })[] = CHANNELS.flatMap(
    (ch) => (states[ch]?.paired ?? []).map((p) => ({ ...p, channel: ch })),
  ).sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

  const handleDecision = async (channel: Channel, requestId: string, approved: boolean) => {
    setBusy((prev) => ({ ...prev, [requestId]: true }));
    try {
      await resolveChannelPairingRequest(channel, requestId, approved);
      await fetchAll();
    } finally {
      setBusy((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const handleRevoke = async (channel: Channel, senderId: string) => {
    const key = `${channel}:${senderId}`;
    setBusy((prev) => ({ ...prev, [key]: true }));
    try {
      await revokeChannelPairedUser(channel, senderId);
      await fetchAll();
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">

        {/* Pending requests */}
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Pending Requests
            {allPending.length > 0 && (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {allPending.length}
              </span>
            )}
          </h3>
          {allPending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending pairing requests.</p>
          ) : (
            <div className="space-y-3">
              {allPending.map((req) => (
                <Card key={req.id} className="border-border/60 bg-card/80">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                          {channelLabel(req.channel)}
                        </Badge>
                        <span className="truncate font-medium">
                          {req.senderDisplay ?? req.senderId}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          Code: <span className="font-mono font-bold text-foreground">{req.code}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTs(req.lastSeenAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/30 text-red-500 hover:bg-red-500/10"
                        disabled={!!busy[req.id]}
                        onClick={() => handleDecision(req.channel, req.id, false)}
                      >
                        <XCircle className="mr-1.5 h-3.5 w-3.5" />
                        Deny
                      </Button>
                      <Button
                        size="sm"
                        disabled={!!busy[req.id]}
                        onClick={() => handleDecision(req.channel, req.id, true)}
                      >
                        <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                        Approve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Paired users */}
        {allPaired.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Paired Users
            </h3>
            <div className="space-y-2">
              {allPaired.map((p) => (
                <Card key={`${p.channel}:${p.senderId}`} className="border-border/40 bg-card/50">
                  <CardContent className="flex items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                        {channelLabel(p.channel)}
                      </Badge>
                      <span className="truncate text-sm font-medium">
                        {p.senderDisplay ?? p.senderId}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        since {formatTs(p.approvedAt)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={!!busy[`${p.channel}:${p.senderId}`]}
                      onClick={() => handleRevoke(p.channel, p.senderId)}
                    >
                      Revoke
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
```

- [ ] **Step 5.2: Type-check**
```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 5.3: Commit**
```bash
git add frontend/src/pages/approvals/ApprovalsPage.tsx
git commit -m "feat: add ApprovalsPage component for channel pairing request queue"
```

---

## Task 6: Frontend — routing and navigation

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/navigation.ts`
- Modify: `frontend/src/lib/dashboard-routes.ts`

- [ ] **Step 6.1: Add lazy import and route in `App.tsx`**

In `frontend/src/App.tsx`, after the `LogsPage` import line (around line 28), add:
```tsx
const ApprovalsPage = lazy(() => import('./pages/approvals/ApprovalsPage').then(m => ({ default: m.ApprovalsPage })));
```

Inside `<Route element={<AppLayout />}>`, after the `<Route path="messages" ...>` line (around line 121), add:
```tsx
{/* Approvals */}
<Route path="approvals" element={<ApprovalsPage />} />
```

- [ ] **Step 6.2: Add sidebar nav item in `navigation.ts`**

In `frontend/src/lib/navigation.ts`, add `CheckSquare` to the import from lucide-react:
```ts
import {
  BarChart,
  CheckSquare,    // add this
  Database,
  // ...rest unchanged
} from 'lucide-react';
```

In the `operations` group items array, add after `messages`:
```ts
{ id: 'approvals', label: 'Approvals', icon: CheckSquare, href: '/approvals', matchPrefix: '/approvals' },
```

- [ ] **Step 6.3: Add page header in `dashboard-routes.ts`**

In `frontend/src/lib/dashboard-routes.ts`, find the `resolvePageHeader` function. After the `normalized.startsWith('/sessions')` block (around line 203), add:
```ts
if (normalized.startsWith('/approvals')) {
  return { id: 'approvals', title: 'Approvals', subtitle: 'Pending channel pairing requests' };
}
```

Note: `'approvals'` is not a `PrimaryNavId`, so use a type assertion or extend the type. Check if `PageHeader.id` is typed as `PrimaryNavId` or as a general string. If it's `PrimaryNavId`, add `'approvals'` to that union in `dashboard-routes.ts`.

- [ ] **Step 6.4: Type-check**
```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | head -20
```
Fix any type errors (likely `PrimaryNavId` needing `'approvals'` added). If `PrimaryNavId` is defined in `dashboard-routes.ts`, add `'approvals'` to it.

- [ ] **Step 6.5: Commit**
```bash
git add frontend/src/App.tsx frontend/src/lib/navigation.ts frontend/src/lib/dashboard-routes.ts
git commit -m "feat: add /approvals route and sidebar nav entry"
```

---

## Task 7: Frontend — sidebar badge

**Files:**
- Modify: `frontend/src/components/sidebar/sidebar.tsx`

- [ ] **Step 7.1: Call `usePendingApprovalsCount` and render badge**

In `frontend/src/components/sidebar/sidebar.tsx`:

Add imports at the top:
```tsx
import { usePendingApprovalsCount } from '@/hooks/use-pending-approvals-count';
```

Inside the `Sidebar` component function (after the existing hooks, around line 25), add:
```tsx
const { count: pendingApprovals } = usePendingApprovalsCount();
```

Update `renderItem` to show a badge when the item is `approvals` and there are pending requests. Replace the collapsed button return (around line 37) with:
```tsx
if (collapsed) {
  return (
    <button
      key={item.id}
      onClick={() => navigate(item.href)}
      title={item.label}
      className={cn(
        'relative w-10 h-10 mx-auto flex items-center justify-center rounded-xl transition-all mb-1',
        active
          ? 'bg-primary text-primary-foreground shadow-md scale-105'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      <Icon size={20} />
      {item.id === 'approvals' && pendingApprovals > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground">
          {pendingApprovals > 99 ? '99+' : pendingApprovals}
        </span>
      )}
    </button>
  );
}
```

And the expanded item return (around line 53):
```tsx
return (
  <button
    key={item.id}
    onClick={() => navigate(item.href)}
    className={cn(
      'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative',
      active
        ? 'border-l-2 border-primary text-primary bg-primary/[0.06]'
        : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
    )}
  >
    <Icon
      size={18}
      className={cn(
        'transition-colors',
        active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
      )}
    />
    <span className="truncate flex-1">{item.label}</span>
    {item.id === 'approvals' && pendingApprovals > 0 && (
      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
        {pendingApprovals > 99 ? '99+' : pendingApprovals}
      </span>
    )}
  </button>
);
```

- [ ] **Step 7.2: Type-check**
```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 7.3: Commit**
```bash
git add frontend/src/components/sidebar/sidebar.tsx
git commit -m "feat: show live pending count badge on Approvals sidebar item"
```

---

## Task 8: End-to-end verification

- [ ] **Step 8.1: Start the backend**
```bash
cd /Users/kien.ha/Code/RushDino
cargo run -p rushdino-server 2>&1 &
```

- [ ] **Step 8.2: Start the frontend dev server**
```bash
cd frontend && npm run dev
```

- [ ] **Step 8.3: Verify page loads**
Navigate to `http://localhost:5173/approvals`. Expected: Approvals page renders with "No pending pairing requests."

- [ ] **Step 8.4: Verify sidebar item appears**
Check sidebar — "Approvals" item should be visible. No badge (count = 0).

- [ ] **Step 8.5: Trigger a test pairing request (if Telegram available)**
Send a DM from an unregistered Telegram account. The sidebar badge should increment within seconds (via WS event). Navigate to `/approvals` — request appears.

- [ ] **Step 8.6: Approve request**
Click Approve. Request disappears from Pending and appears in Paired. Badge clears to 0.

- [ ] **Step 8.7: Revoke paired user**
Click Revoke on the paired user. They disappear from the Paired section.
