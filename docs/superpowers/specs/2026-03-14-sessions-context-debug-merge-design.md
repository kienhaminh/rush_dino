# Sessions + Context Debug Merge — Design Spec

**Date:** 2026-03-14
**Status:** Approved

## Summary

Merge the `/context-debug` page into the `/sessions` page as a master-detail split layout, giving users direct context inspection from the sessions view without needing a separate route.

## Layout

### Left Sidebar (~260px, fixed width)

Compact session list:
- **Header**: "Sessions" title + total/active/awaiting chip counts + Refresh button
- **Session rows**: status dot (with pulse animation for active/awaiting), session name, token usage micro-bar (color-coded by fill ratio), token count label
- **Hover**: delete button appears on row hover (red tint, confirmation via `window.confirm`)
- **Selection**: active row highlighted with cyan tint + border

### Right Panel (remaining width)

When **no session selected**: centered empty-state — "Select a session to inspect its context".

When **session selected**: full context debug view:
- Token usage bar with system prompt / message breakdown
- Export JSON + Prompt Inspector buttons
- Message thread (with test message injection)
- Right sidebar panels: Bootstrap files, Tool calls, Run history, Registered tools

Auto-selects the most recently updated session on first load.

## Data & State

Combined route merges `SessionsRoute` + `ContextDebugRoute` logic:

| Concern | Source |
|---|---|
| Sessions list | `fetchSessions()` — polled every 30s |
| Soul memory | `fetchSoulMemoryState()` — on mount |
| System prompt | `fetchSystemPrompt()` — on mount |
| Registered tools | `fetchRegisteredTools()` — on mount |
| Runs | `fetchSessionRuns(selectedSessionId, 30)` — on session change |
| Messages | `fetchConversation(conversationId)` — after runs load |
| Delete | `deleteConversation(sessionId)` + toast + list refresh |

## Files Affected

### New / Replaced
- `frontend/src/pages/sessions/SessionsRoute.tsx` — replaced with merged route logic
- `frontend/src/pages/sessions/SessionsPage.tsx` — replaced with split-pane layout

### Deleted
- `frontend/src/pages/context-debug/ContextDebugRoute.tsx`
- `frontend/src/pages/context-debug/ContextDebugPage.tsx`
- `frontend/src/pages/context-debug/` directory (components moved or deleted)

### Modified
- `frontend/src/App.tsx` — remove `/context-debug` route
- Sidebar nav — remove "Context Debug" link

### Kept (reused)
- `frontend/src/pages/context-debug/components/TokenUsageBar.tsx`
- `frontend/src/pages/context-debug/components/MessageThread.tsx`
- `frontend/src/pages/context-debug/components/SidebarPanels.tsx`
- `frontend/src/pages/context-debug/components/PromptInspector.tsx`
- `frontend/src/pages/context-debug/components/SystemPromptPanel.tsx`

These components stay in place; only the page and route wrappers are removed.

## Design Decisions

- **Compact sidebar over mini-cards**: maximizes horizontal space for the context panel
- **Remove `/context-debug` route**: no redirect needed — sessions page fully replaces it
- **Auto-select latest session**: preserves existing ContextDebugRoute UX behavior
- **Delete stays in sidebar**: hover-reveal delete button per session row
