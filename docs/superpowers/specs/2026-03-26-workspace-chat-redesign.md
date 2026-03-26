# Workspace Chat Conversation Redesign

**Date:** 2026-03-26
**Scope:** Frontend — surgical update to 4 components
**Goal:** Make the main workspace chat conversation feel like a mix of Claude web (polish, spacing) and Claude Code (tool call detail, structure)

---

## Context

The workspace chat (`ChatPage.tsx`) uses `ConversationTimeline` to render conversation items. This spec covers a surgical update to four files:

1. `frontend/src/components/workspace/thinking-block.tsx`
2. `frontend/src/components/workspace/tool-use-block.tsx`
3. `frontend/src/components/workspace/conversation-timeline.tsx`
4. `frontend/src/components/workspace/assistant-rich-content.tsx` *(cursor prop only)*

No changes to data flow, WebSocket hooks, message types, or `ChatPage.tsx`.

---

## Design Goals

- **B** — Thinking block styled like Claude web's soft collapsible section
- **C** — Tool call blocks styled like Claude Code's structured blocks, with smart expand/collapse
- **D** — More spacious layout and better typography throughout
- **F** — Smoother streaming animation with blinking cursor

---

## 1. ThinkingBlock (`thinking-block.tsx`)

### New Design

**Initial state:** `useState(true)` — expanded by default so content is visible during live streaming.

**Auto-collapse:** `useLayoutEffect(() => { if (done) setExpanded(false); }, [done])` — use `useLayoutEffect` (not `useEffect`) so the collapse fires synchronously before paint, preventing a one-frame flash of the `done+expanded` state ("Thought for a moment" + ChevronUp visible for one render tick before collapsing). The effect also fires on mount (when `done=false`), which is harmless since the condition is not met.

**DOM structure:** Replace the current three-branch pattern (live / done-collapsed / done-expanded) with a **single unified container** that always renders a header row and conditionally renders a content area below it. The header row's contents change based on state using inline conditionals.

```tsx
<div className="border-l-2 border-muted-foreground/20 pl-3 py-1 ...">
  {/* Header row — always rendered */}
  <button
    onClick={() => done && setExpanded(v => !v)}
    disabled={!done}
    className={cn("flex items-center gap-2 w-full text-left", done && "cursor-pointer")}
  >
    <span className="text-[10px] text-muted-foreground/50">
      {done ? "Thought for a moment" : "Thinking…"}
    </span>
    {/* Inline dots animation — only when live */}
    {!done && <span>...dots...</span>}
    {/* Chevron — only when done */}
    {done && (expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
  </button>
  {/* Content area — rendered when expanded (live or done-expanded) */}
  {expanded && content && (
    <p className="text-sm text-muted-foreground/60 leading-relaxed whitespace-pre-wrap mt-1 max-h-60 overflow-y-auto animate-in fade-in duration-200">
      {content}
    </p>
  )}
</div>
```

**Content area rules:**
- Shown when `expanded === true` regardless of `done` state.
- If `content` is empty/undefined while live, nothing renders below the header (dots are header-only).
- `max-h-60 overflow-y-auto` when done; no height cap during live streaming (content grows naturally).

**State machine summary:**
```
live (streaming):      expanded=true,  header="Thinking…" + dots, chevron hidden,    content visible if non-empty
done + collapsed:      expanded=false, header="Thought for a moment", ChevronDown,    content hidden
done + expanded:       expanded=true,  header="Thought for a moment", ChevronUp,      content visible
```

---

## 2. ToolUseBlock (`tool-use-block.tsx`)

### Smart Collapse Logic

```tsx
const [userOverride, setUserOverride] = useState<boolean | null>(null);
const isExpanded = userOverride !== null ? userOverride : isRunning;

// Reset user override when status value actually changes (running→done, running→error, etc.)
// This is safe because the parent (use-websocket) creates a new item ref only when
// status changes, so the effect fires at most once per status transition.
// Cycling (running→done→running) resets override each time.
useEffect(() => { setUserOverride(null); }, [item.status]);
```

Default behavior: auto-expanded while `running`, auto-collapsed when `done` or `error`. User click on the header sets `userOverride` and persists until next status change.

**History items:** Tool items that mount already in `done` or `error` state (e.g. loaded from conversation history) default to collapsed — `isRunning=false` so `isExpanded=false`. This is intentional: history views show a compact summary row; users can expand on demand.

### Visual Changes

**Remove** the left circular terminal icon entirely.

**Left border accent:**
- `border-l-2 border-amber-400/60` while running
- `border-l-2 border-emerald-400/40` when done
- `border-l-2 border-red-400/40` on error

**Header row** (always visible, full-width clickable):
- Tool name: `font-mono text-sm font-medium text-foreground/80`
- Summary hint: `text-[11px] text-muted-foreground/50 truncate font-mono ml-2`
- Right side: status icon + chevron (same icons as current: `Loader2` / `CheckCircle2` / `XCircle`, then `ChevronDown` / `ChevronRight`)

### Input Formatting

Detection is based on **arg key name** (case-insensitive). Each key-value pair in `args` is rendered individually.

**DOM structure for input section:**
```tsx
<div className="space-y-1.5">
  {Object.entries(item.args).map(([key, value]) => (
    <div key={key} className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/40">{key}</span>
      {renderArgValue(key, value)}
    </div>
  ))}
</div>
```

**`renderArgValue(key, value)` dispatch rules** (key matched case-insensitively):

| Key matches | Render |
|------------|--------|
| `path`, `file_path`, `file` | `<span className="flex items-center gap-1 font-mono text-[11px] text-foreground/70"><FileText size={10} />{String(value)}</span>` |
| `command`, `cmd` | `<code className="block font-mono text-[11px] text-foreground/70 bg-background/50 rounded px-1.5 py-0.5 whitespace-pre-wrap break-words">{String(value)}</code>` |
| `query`, `search` | `<span className="text-[11px] text-muted-foreground/70">{String(value)}</span>` |
| Anything else | `<pre className="text-[11px] text-muted-foreground/70 bg-background/50 rounded px-1.5 py-0.5 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">{JSON.stringify(value, null, 2)}</pre>` |

Section label: `INPUT` in `text-[9px] uppercase tracking-widest text-muted-foreground/40 mb-1`.

### Output Section

Section label: `OUTPUT` (or `ERROR` in red) — same style as INPUT label.

```
Success: text-muted-foreground/80 bg-background/50 border border-border/20 rounded-lg p-2
Error:   text-red-400/80 bg-red-500/5 border border-red-500/20 rounded-lg p-2
```

`max-h-48 overflow-y-auto scrollbar-thin` scrollable `<pre>` block.

---

## 3. ConversationTimeline (`conversation-timeline.tsx`)

### Layout & Spacing

- Container: `py-8` (from `py-6`), keep `px-4 md:px-8`
- Item spacing: `space-y-2` (from `space-y-1`)
- Each `user` kind item gets `mt-6` top margin via conditional className

### Typography

- "You" / "Assistant" labels: `text-[10px]` (from `text-[9px]`)

### User Message Bubble

- Background: `bg-primary/90` (from full `bg-primary`) — slightly softer
- Border radius: `rounded-2xl` — slightly rounder than current `rounded-[18px]`

### Typing Indicator (streaming, no live thinking)

Replace the three-dot bounce with a single animated bar, inside the existing card container:

```tsx
{showTypingBubble && (
  <div className="flex justify-start py-1 animate-in fade-in duration-200">
    <div className="bg-card border border-border/40 rounded-xl px-4 py-3 shadow-sm">
      <div className="w-16 h-1 rounded-full bg-muted-foreground/30 animate-pulse" />
    </div>
  </div>
)}
```

The `hasLiveThinking` suppression logic is unchanged: `showTypingBubble = isStreaming && !hasLiveThinking`.

### Blinking Cursor on Streaming Assistant Message

**Do not pass `isStreaming` or `isLast` to all `TimelineItem` instances** — that would cause every item to re-render on every streaming tick, defeating the existing memoization strategy.

Instead, compute `showCursor` at the `ConversationTimeline` level and pass it only as a single `showCursor?: boolean` prop:

```tsx
interface TimelineItemProps {
  item: ConversationItem;
  showCursor?: boolean;  // only true for the last assistant item while streaming
}
```

`ConversationTimeline` uses the array index to determine which item gets the cursor:

```tsx
{items.map((item, index) => {
  const isLast = index === items.length - 1;
  const showCursor = isStreaming && isLast && item.kind === 'assistant';
  return (
    <TimelineItem
      key={item.id}
      item={item}
      showCursor={showCursor}
    />
  );
})}
```

**Memo behavior:** `showCursor` changes for at most two items per streaming event: the newly-added last item (`showCursor` becomes `true`) and the previously-last item (`showCursor` becomes `false`). All other items are memoized and skipped. When streaming ends, the last item re-renders once more to clear the cursor. This preserves the existing O(1) re-render property.

The `assistant` render branch in `TimelineItem` passes `showCursor` to `AssistantRichContent`:

```tsx
if (item.kind === 'assistant') {
  return (
    <div className="flex justify-start py-1">
      ...
      <AssistantRichContent
        content={item.content}
        richContent={item.richContent ?? null}
        showCursor={showCursor}
      />
      ...
    </div>
  );
}
```

All other branches (`user`, `thinking`, `tool_use`, `error`, `approval`) do not receive or use `showCursor`.

### Fade-in Duration

All `animate-in fade-in` instances: `duration-200` (from `duration-300`).

---

## 4. AssistantRichContent (`assistant-rich-content.tsx`)

Add a single optional prop:

```tsx
interface AssistantRichContentProps {
  content: string;
  richContent: RichContent | null;
  showCursor?: boolean;  // NEW
}
```

The cursor condition aligns with the actual code branch in `AssistantRichContent`:

```tsx
// Plain text path (existing code: !richContent || richContent.blocks.length === 0)
if (!richContent || richContent.blocks.length === 0) {
  return (
    <div>
      <MarkdownBlock text={content} />
      {showCursor && (
        <span className="inline-block w-[2px] h-[14px] bg-foreground/60 animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  );
}

// Rich blocks path — no cursor (would be visually misplaced inside structured blocks)
return <...rich blocks...>;
```

**When `content` is empty string during streaming:** `MarkdownBlock` renders nothing, and the cursor span still renders — this is correct. The cursor acts as a visual "agent is active" indicator even before any text has arrived.

The cursor is shown when `showCursor=true` AND the plain text branch is active (`!richContent || richContent.blocks.length === 0`). It is suppressed on the rich blocks path even if `showCursor=true`.

---

## Files Changed

| File | Change |
|------|--------|
| `thinking-block.tsx` | Full redesign — left-border style, new header/content pattern |
| `tool-use-block.tsx` | Redesign — smart collapse, remove left icon, input formatting, left border accent |
| `conversation-timeline.tsx` | Spacing, typography, typing indicator, cursor prop passthrough |
| `assistant-rich-content.tsx` | Add `showCursor?: boolean` prop — plain text path only |

No changes to: `use-websocket.ts`, `message-converter.ts`, `ChatPage.tsx`, `sub-agent-panel.tsx`, `types.ts`.

---

## Out of Scope

- Sub-agent `SessionDetail` rendering
- User message editing / retry
- Copy buttons on code blocks
- Syntax highlighting
- Message reactions or threading
