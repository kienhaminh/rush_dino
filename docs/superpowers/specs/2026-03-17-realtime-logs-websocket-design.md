# Realtime Logs WebSocket Design

## Goal

Make the Logs page truly realtime by streaming runtime log entries over the existing dashboard WebSocket instead of polling `/api/logs` every 2 seconds.

## Decisions

- Reuse the existing dashboard WebSocket at `/api/ws/chat`.
- Keep `/api/logs` as the snapshot/history endpoint for initial page load and reconnect recovery.
- Replace the current error-only runtime log broadcast with a general runtime log broadcast event.
- Limit scope to live viewing only. Do not build archive pagination in this change.

## Scope

### Backend

- Broadcast every persisted runtime log entry through the existing `ChatBroadcastHub`.
- Emit a new WebSocket event type carrying a `RuntimeLogRecord`-compatible payload.
- Preserve the existing `/api/logs` route for initial history and reconnect backfill.

### Frontend

- Load recent logs once from `/api/logs`.
- Subscribe to runtime log events over the existing WebSocket connection.
- Append incoming log entries to the in-memory list and keep current filters/export behavior.
- On reconnect, refetch recent logs and dedupe by log id.

## Data Flow

1. `RuntimeLogStore::insert(...)` writes the log row to SQLite.
2. After persistence, the store broadcasts a `runtime_log` event through `ChatBroadcastHub`.
3. The dashboard WebSocket forwards that event to connected clients.
4. The Logs page receives the event, maps it into `LogEntry`, and appends it locally.
5. If the socket reconnects, the page reloads recent history from `/api/logs` before resuming live append.

## Error Handling

- If the WebSocket disconnects, the Logs page should show a disconnected state instead of pretending live follow is active.
- Reconnects should trigger a recent-history refetch to heal missed entries.
- Non-log WebSocket consumers must ignore the new `runtime_log` event cleanly.

## Testing

- Backend test that inserting a runtime log emits a `runtime_log` broadcast payload.
- Frontend test that the Logs page/controller accepts `runtime_log` WebSocket events and appends them without polling.
- Focused frontend typecheck/build after the targeted tests pass.
