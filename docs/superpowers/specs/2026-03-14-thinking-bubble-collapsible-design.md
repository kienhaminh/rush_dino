# Thinking Bubble — Collapsible Chat Design

**Date:** 2026-03-14
**Status:** Approved

## Summary

Redesign the `ThinkingBlock` component so the agent's thinking state appears as a proper chat bubble inline in the conversation. While thinking is active it shows animated dots; when the assistant replies it auto-collapses to a compact "View reasoning" pill that the user can expand.

## Problem

Currently `replaceAssistantItem` in `use-websocket.ts` removes all `thinking` items from the conversation list when an `assistant_message` arrives. This means thinking bubbles disappear entirely — users cannot review the agent's reasoning after the fact.

Additionally, the current `ThinkingBlock` uses tiny mono text at 40% opacity, which looks more like a debug log than a natural chat bubble.

## Design

### Data model (`types.ts`)

Add `done` flag to the thinking ConversationItem:

```ts
| { kind: 'thinking'; id: string; content?: string; done?: boolean }
```

### WebSocket hook (`use-websocket.ts`)

In `replaceAssistantItem`, replace the filter that removes thinking items with a map that marks them done:

```ts
// Before
.filter((item) => item.kind !== 'thinking')

// After
.map((item) => item.kind === 'thinking' ? { ...item, done: true } : item)
```

This applies in both branches of `replaceAssistantItem` (the `lastAssistantIndex === -1` path and the normal replacement path).

### ThinkingBlock component (`thinking-block.tsx`)

Three visual states:

| State | Trigger | Visual |
|---|---|---|
| **Live** | `done` is falsy | Cyan-tinted bubble, animated dots + italic "Thinking…" |
| **Collapsed** | `done` becomes `true` (auto) | Compact bubble: "🧠 View reasoning ▾" |
| **Expanded** | User clicks collapsed bubble | Full thinking content with "▴ Hide" toggle |

**Auto-collapse:** `useEffect` watches the `done` prop — when it transitions to `true`, set internal `collapsed` state to `true`.

**Styling (matches real theme tokens):**
- Background: `hsla(185, 80%, 47%, 0.07)` (primary cyan tint at 7%)
- Border: `hsla(185, 80%, 47%, 0.25)`
- Label color: `hsl(185, 80%, 47%)` (primary)
- Bubble shape: `rounded-[18px] rounded-bl-[4px]` — matches assistant bubble
- Font: `JetBrains Mono`, italic for thinking content
- Text color: `hsl(185, 40%, 60%)` (muted cyan)

## Files to Change

| File | Change |
|---|---|
| `frontend/src/lib/types.ts` | Add `done?: boolean` to `thinking` ConversationItem |
| `frontend/src/hooks/use-websocket.ts` | Mark thinking items done instead of filtering them |
| `frontend/src/components/workspace/thinking-block.tsx` | Full redesign with three states |

## Out of Scope

- Showing thinking duration / token count (no timing data available in current events)
- Persisting collapse state across page reloads
- Showing thinking bubbles in historical conversation loads (REST API messages don't carry thinking content)
