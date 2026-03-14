# Thinking Bubble — Collapsible Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the thinking state bubble to appear as a proper chat bubble — animated dots while streaming, auto-collapsing to a "View reasoning" pill when the assistant replies, expandable on click.

**Architecture:** Three small, sequential changes: extend the `ConversationItem` type with a `done` flag, update `replaceAssistantItem` in `use-websocket.ts` to mark thinking items done instead of removing them, and redesign `ThinkingBlock` with three visual states (live → collapsed → expanded).

**Tech Stack:** React, TypeScript, Tailwind CSS v3, JetBrains Mono font, shadcn/ui CSS tokens.

---

## File Map

| File | Role |
|---|---|
| `frontend/src/lib/types.ts` | Add `done?: boolean` to `thinking` ConversationItem |
| `frontend/src/hooks/use-websocket.ts` | Mark thinking items done instead of filtering |
| `frontend/src/components/workspace/thinking-block.tsx` | Full component redesign |

---

## Chunk 1: Type + Hook

### Task 1: Extend the `thinking` ConversationItem type

**File:** `frontend/src/lib/types.ts`

**Context:** `ConversationItem` is a discriminated union. The `thinking` variant (line ~690) currently has `{ kind: 'thinking'; id: string; content?: string }`. We need a `done` flag so downstream components know whether thinking is still streaming.

- [ ] **Step 1: Add `done` field**

  In `frontend/src/lib/types.ts`, find the thinking variant:
  ```ts
  | { kind: 'thinking'; id: string; content?: string }
  ```
  Change it to:
  ```ts
  | { kind: 'thinking'; id: string; content?: string; done?: boolean }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  Run from `frontend/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/lib/types.ts
  git commit -m "feat(types): add done flag to thinking ConversationItem"
  ```

---

### Task 2: Mark thinking items done instead of removing them

**File:** `frontend/src/hooks/use-websocket.ts`

**Context:** `replaceAssistantItem` (lines ~38–70) is called when an `assistant_message` WebSocket event arrives. It currently removes thinking items with `.filter(item => item.kind !== 'thinking')`. This makes thinking bubbles disappear entirely. We need them to stay but be marked as done so `ThinkingBlock` can show the collapsed state.

There are **two** `.filter` calls inside `replaceAssistantItem` — both must change.

- [ ] **Step 1: Replace both filter calls with a map**

  Find (line ~59):
  ```ts
  return [...previous.filter((item) => item.kind !== 'thinking'), normalized];
  ```
  Replace with:
  ```ts
  return [
    ...previous.map((item) =>
      item.kind === 'thinking' ? { ...item, done: true } : item,
    ),
    normalized,
  ];
  ```

  Find (line ~65):
  ```ts
  ...previous.slice(index + 1).filter((item) => item.kind !== 'thinking'),
  ```
  Replace with:
  ```ts
  ...previous.slice(index + 1).map((item) =>
    item.kind === 'thinking' ? { ...item, done: true } : item,
  ),
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/hooks/use-websocket.ts
  git commit -m "feat(ws): mark thinking items done instead of removing on assistant reply"
  ```

---

## Chunk 2: ThinkingBlock Redesign

### Task 3: Redesign `ThinkingBlock` with three visual states

**File:** `frontend/src/components/workspace/thinking-block.tsx`

**Context:** The component currently renders a single static layout. It needs three states:
- **Live** (`done` is falsy): Left-aligned bubble with animated dots + "Thinking…" italic text. Uses primary cyan tint.
- **Collapsed** (`done` is true, `expanded` is false — the auto-default): Compact clickable bubble showing "🧠 View reasoning ▾".
- **Expanded** (`done` is true, `expanded` is true): Full thinking content with "▴ Hide" button.

Auto-collapse: a `useEffect` watches the `done` prop. When `done` becomes `true`, set `collapsed = true` (i.e. `expanded = false`).

**Theme tokens to use (dark mode):**
- Background tint: `bg-primary/[0.07]` (7% opacity primary)
- Border: `border-primary/25`
- Label color: `text-primary` (cyan)
- Thinking text: `text-primary/60 italic`
- Bubble shape: `rounded-[18px] rounded-bl-[4px]` — matches assistant bubble
- Font: `font-mono`

- [ ] **Step 1: Rewrite the component**

  Replace the entire contents of `frontend/src/components/workspace/thinking-block.tsx` with:

  ```tsx
  import { useEffect, useState } from 'react';
  import { Brain } from 'lucide-react';

  interface ThinkingBlockProps {
    content?: string;
    done?: boolean;
  }

  export function ThinkingBlock({ content, done }: ThinkingBlockProps) {
    const [expanded, setExpanded] = useState(false);

    // Auto-collapse when thinking finishes
    useEffect(() => {
      if (done) setExpanded(false);
    }, [done]);

    return (
      <div className="flex justify-start py-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="max-w-[85%] flex flex-col items-start gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-primary/60 pl-1 flex items-center gap-1.5">
            <Brain size={9} className={done ? undefined : 'animate-pulse'} />
            Thinking
          </span>

          {/* ── Live state: streaming not yet done ── */}
          {!done && (
            <div className="bg-primary/[0.07] border border-primary/25 rounded-[18px] rounded-bl-[4px] px-4 py-3 shadow-sm min-w-[80px]">
              {content ? (
                <p className="text-[11px] text-primary/60 font-mono italic leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {content}
                </p>
              ) : (
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Collapsed state: done, not expanded ── */}
          {done && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="bg-primary/[0.07] border border-primary/25 rounded-[18px] rounded-bl-[4px] px-4 py-2.5 shadow-sm text-[11px] text-primary/70 font-mono flex items-center gap-2 hover:bg-primary/[0.12] transition-colors"
            >
              <Brain size={10} />
              View reasoning
              <span className="text-primary/40 text-[10px]">▾</span>
            </button>
          )}

          {/* ── Expanded state: done, user clicked to open ── */}
          {done && expanded && (
            <div className="bg-primary/[0.07] border border-primary/25 rounded-[18px] rounded-bl-[4px] px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-primary/40">
                  Reasoning
                </span>
                <button
                  onClick={() => setExpanded(false)}
                  className="text-[10px] text-primary/50 hover:text-primary/80 transition-colors font-mono flex items-center gap-1"
                >
                  Hide <span>▴</span>
                </button>
              </div>
              <p className="text-[11px] text-primary/60 font-mono italic leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                {content ?? '(no content)'}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Start the dev server and visually verify**

  ```bash
  cd frontend && npm run dev
  ```

  Open the app, start a conversation with a model that has thinking enabled. Verify:
  1. While the agent thinks: animated dots appear in a cyan-tinted bubble.
  2. When the assistant replies: bubble auto-collapses to "View reasoning ▾".
  3. Click "View reasoning": content expands.
  4. Click "Hide ▴": collapses again.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/components/workspace/thinking-block.tsx
  git commit -m "feat(ui): collapsible thinking bubble with auto-collapse on reply"
  ```
