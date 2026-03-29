# Workspace Chat Conversation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the workspace chat conversation to feel like a mix of Claude web (polish/spacing) and Claude Code (tool call detail/structure) by surgically updating 4 React components.

**Architecture:** Surgical updates to `thinking-block.tsx`, `tool-use-block.tsx`, `conversation-timeline.tsx`, and `assistant-rich-content.tsx`. No changes to data flow, WebSocket hooks, or message types. Each component is updated independently with tests first.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest with `renderToStaticMarkup` for node tests, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-03-26-workspace-chat-redesign.md`

---

## File Map

| File | Change |
|------|--------|
| `frontend/vitest.node.config.ts` | Extend include pattern to pick up `.node.test.tsx` files |
| `frontend/src/components/workspace/assistant-rich-content.tsx` | Add `showCursor?: boolean` prop |
| `frontend/src/components/workspace/assistant-rich-content.node.test.tsx` | New — tests for cursor prop |
| `frontend/src/components/workspace/thinking-block.tsx` | Full redesign — unified container, useLayoutEffect, left border |
| `frontend/src/components/workspace/thinking-block.node.test.tsx` | New — tests for live/done states |
| `frontend/src/components/workspace/tool-use-block.tsx` | Redesign — smart collapse, remove icon, per-arg input, left border |
| `frontend/src/components/workspace/tool-use-block.node.test.tsx` | New — tests for collapse states and input formatting |
| `frontend/src/components/workspace/conversation-timeline.tsx` | Spacing, typing indicator, showCursor passthrough |
| `frontend/src/components/workspace/conversation-timeline.node.test.tsx` | New — tests for cursor passthrough and typing indicator |

---

## Task 1: Extend test runner to support `.tsx` node tests

The `vitest.node.config.ts` currently only picks up `*.node.test.ts` (not `.tsx`). All new test files use JSX so they need the `.tsx` extension.

**Files:**
- Modify: `frontend/vitest.node.config.ts`

- [ ] **Step 1: Read the current config**

  Open `frontend/vitest.node.config.ts` and note the `include` array.

- [ ] **Step 2: Extend the include pattern**

  Change:
  ```ts
  include: ["src/**/*.node.test.ts"],
  ```
  To:
  ```ts
  include: ["src/**/*.node.test.ts", "src/**/*.node.test.tsx"],
  ```

- [ ] **Step 3: Verify the config change works**

  Run:
  ```bash
  cd frontend && npx vitest run --config vitest.node.config.ts src/pages/instances/instances-page.node.test.tsx
  ```
  Expected: The existing `InstancesPage` test runs and **passes** (1 test).

- [ ] **Step 4: Commit**

  ```bash
  cd frontend && git add vitest.node.config.ts
  git commit -m "test: extend vitest node config to include .tsx test files"
  ```

---

## Task 2: AssistantRichContent — `showCursor` prop

Add an optional `showCursor` prop. When true and on the plain-text rendering path (`!richContent || richContent.blocks.length === 0`), append a blinking cursor span after the markdown content.

**Files:**
- Modify: `frontend/src/components/workspace/assistant-rich-content.tsx`
- Create: `frontend/src/components/workspace/assistant-rich-content.node.test.tsx`

- [ ] **Step 1: Write failing tests**

  Create `frontend/src/components/workspace/assistant-rich-content.node.test.tsx`:

  ```tsx
  import { describe, expect, it } from 'vitest';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { AssistantRichContent } from './assistant-rich-content';

  describe('AssistantRichContent', () => {
    it('renders cursor span when showCursor=true and no richContent', () => {
      const html = renderToStaticMarkup(
        <AssistantRichContent content="hello" richContent={null} showCursor={true} />,
      );
      // cursor is an inline-block span with animate-pulse
      expect(html).toContain('animate-pulse');
      expect(html).toContain('inline-block');
    });

    it('does not render cursor when showCursor=false', () => {
      const html = renderToStaticMarkup(
        <AssistantRichContent content="hello" richContent={null} showCursor={false} />,
      );
      expect(html).not.toContain('animate-pulse');
    });

    it('does not render cursor when richContent has blocks even if showCursor=true', () => {
      const html = renderToStaticMarkup(
        <AssistantRichContent
          content="hello"
          richContent={{ blocks: [{ type: 'formatted_text', format: 'markdown', text: 'hi' }] }}
          showCursor={true}
        />,
      );
      expect(html).not.toContain('animate-pulse');
    });

    it('renders cursor when showCursor=true and richContent has zero blocks', () => {
      const html = renderToStaticMarkup(
        <AssistantRichContent content="" richContent={{ blocks: [] }} showCursor={true} />,
      );
      expect(html).toContain('animate-pulse');
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd frontend && npx vitest run --config vitest.node.config.ts src/components/workspace/assistant-rich-content.node.test.tsx
  ```
  Expected: **FAIL** — `showCursor` prop does not exist yet.

- [ ] **Step 3: Implement the change**

  In `frontend/src/components/workspace/assistant-rich-content.tsx`:

  1. Add `showCursor?: boolean` to the interface:
     ```tsx
     interface AssistantRichContentProps {
       content: string;
       richContent?: RichContent | null;
       showCursor?: boolean;
     }
     ```

  2. Update the function signature:
     ```tsx
     export function AssistantRichContent({ content, richContent, showCursor }: AssistantRichContentProps) {
     ```

  3. Update the plain-text branch (the `if (!richContent || richContent.blocks.length === 0)` block):
     ```tsx
     if (!richContent || richContent.blocks.length === 0) {
       return (
         <div>
           <MarkdownBlock content={content} />
           {showCursor && (
             <span className="inline-block w-[2px] h-[14px] bg-foreground/60 animate-pulse ml-0.5 align-middle" />
           )}
         </div>
       );
     }
     ```

  The rich-blocks path is unchanged — no cursor there.

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd frontend && npx vitest run --config vitest.node.config.ts src/components/workspace/assistant-rich-content.node.test.tsx
  ```
  Expected: **4 tests pass**.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/components/workspace/assistant-rich-content.tsx \
          frontend/src/components/workspace/assistant-rich-content.node.test.tsx
  git commit -m "feat(workspace): add showCursor prop to AssistantRichContent"
  ```

---

## Task 3: ThinkingBlock — redesign

Replace the three separate JSX branches (live / done-collapsed / done-expanded) with a single unified container. Use `useLayoutEffect` for auto-collapse to prevent a one-frame flicker.

**Files:**
- Modify: `frontend/src/components/workspace/thinking-block.tsx`
- Create: `frontend/src/components/workspace/thinking-block.node.test.tsx`

- [ ] **Step 1: Write failing tests**

  Create `frontend/src/components/workspace/thinking-block.node.test.tsx`:

  ```tsx
  import { describe, expect, it } from 'vitest';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { ThinkingBlock } from './thinking-block';

  describe('ThinkingBlock', () => {
    it('shows "Thinking…" label when not done', () => {
      const html = renderToStaticMarkup(<ThinkingBlock content="some text" done={false} />);
      expect(html).toContain('Thinking');
      expect(html).not.toContain('Thought for a moment');
    });

    it('shows "Thought for a moment" label when done', () => {
      const html = renderToStaticMarkup(<ThinkingBlock content="some text" done={true} />);
      expect(html).toContain('Thought for a moment');
      expect(html).not.toContain('Thinking…');
    });

    it('uses left-border accent container (no rounded bubble)', () => {
      const html = renderToStaticMarkup(<ThinkingBlock content="abc" done={false} />);
      expect(html).toContain('border-l-2');
      // Should NOT use the old rounded bubble class
      expect(html).not.toContain('rounded-[18px]');
    });

    it('shows content text when not done (live streaming state)', () => {
      const html = renderToStaticMarkup(<ThinkingBlock content="my thoughts" done={false} />);
      expect(html).toContain('my thoughts');
    });

    it('renders nothing below header when content is empty and not done', () => {
      const html = renderToStaticMarkup(<ThinkingBlock content="" done={false} />);
      // Dots animation only in header; content <p> should not render when content is empty
      expect(html).not.toContain('whitespace-pre-wrap');
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd frontend && npx vitest run --config vitest.node.config.ts src/components/workspace/thinking-block.node.test.tsx
  ```
  Expected: **FAIL** on border-l-2 and "Thought for a moment" tests.

- [ ] **Step 3: Implement the redesign**

  Replace the entire contents of `frontend/src/components/workspace/thinking-block.tsx`:

  ```tsx
  import { useLayoutEffect, useState } from 'react';
  import { ChevronDown, ChevronUp } from 'lucide-react';
  import { cn } from '@/lib/utils';

  interface ThinkingBlockProps {
    content?: string;
    done?: boolean;
  }

  export function ThinkingBlock({ content, done }: ThinkingBlockProps) {
    // Start expanded so content is visible during live streaming.
    const [expanded, setExpanded] = useState(true);

    // Use useLayoutEffect to collapse synchronously before paint, preventing
    // a one-frame flash of the done+expanded state.
    useLayoutEffect(() => {
      if (done) setExpanded(false);
    }, [done]);

    return (
      <div className="py-1 animate-in fade-in duration-200">
        <div className="border-l-2 border-muted-foreground/20 pl-3 py-1">
          {/* Header row — always visible */}
          <button
            type="button"
            onClick={() => done && setExpanded((v) => !v)}
            disabled={!done}
            className={cn(
              'flex items-center gap-2 w-full text-left',
              done ? 'cursor-pointer' : 'cursor-default',
            )}
          >
            <span className="text-[10px] text-muted-foreground/50 select-none">
              {done ? 'Thought for a moment' : 'Thinking\u2026'}
            </span>
            {/* Inline dot animation — header only, shown while live */}
            {!done && (
              <span className="flex items-center gap-0.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1 h-1 rounded-full bg-muted-foreground/30 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            )}
            {/* Chevron — shown only when done */}
            {done && (
              expanded
                ? <ChevronUp size={10} className="text-muted-foreground/40 ml-auto" />
                : <ChevronDown size={10} className="text-muted-foreground/40 ml-auto" />
            )}
          </button>

          {/* Content area — visible when expanded and content is non-empty */}
          {expanded && content && (
            <p className={cn(
              'text-sm text-muted-foreground/60 leading-relaxed whitespace-pre-wrap mt-1.5',
              done && 'max-h-60 overflow-y-auto scrollbar-thin',
            )}>
              {content}
            </p>
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd frontend && npx vitest run --config vitest.node.config.ts src/components/workspace/thinking-block.node.test.tsx
  ```
  Expected: **5 tests pass**.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/components/workspace/thinking-block.tsx \
          frontend/src/components/workspace/thinking-block.node.test.tsx
  git commit -m "feat(workspace): redesign ThinkingBlock — Claude web style with left border"
  ```

---

## Task 4: ToolUseBlock — redesign

Remove the left circular icon, add smart expand/collapse, left border accent by status, and per-arg formatted input.

**Files:**
- Modify: `frontend/src/components/workspace/tool-use-block.tsx`
- Create: `frontend/src/components/workspace/tool-use-block.node.test.tsx`

- [ ] **Step 1: Write failing tests**

  Create `frontend/src/components/workspace/tool-use-block.node.test.tsx`:

  ```tsx
  import { describe, expect, it } from 'vitest';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { ToolUseBlock } from './tool-use-block';
  import type { ConversationItem } from '@/lib/types';

  type ToolItem = Extract<ConversationItem, { kind: 'tool_use' }>;

  function makeItem(overrides: Partial<ToolItem>): ToolItem {
    return {
      kind: 'tool_use',
      id: 'test-id',
      tool_name: 'read_file',
      args: { path: '/foo/bar.ts' },
      result: undefined,
      status: 'running',
      ...overrides,
    };
  }

  describe('ToolUseBlock', () => {
    it('does not render the old circular terminal icon', () => {
      const html = renderToStaticMarkup(<ToolUseBlock item={makeItem({ status: 'running' })} />);
      // The old icon was in a w-7 h-7 rounded-full div
      expect(html).not.toContain('rounded-full');
    });

    it('uses amber border while running', () => {
      const html = renderToStaticMarkup(<ToolUseBlock item={makeItem({ status: 'running' })} />);
      expect(html).toContain('border-amber-400');
    });

    it('uses green border when done', () => {
      const html = renderToStaticMarkup(<ToolUseBlock item={makeItem({ status: 'done' })} />);
      expect(html).toContain('border-emerald-400');
    });

    it('uses red border on error', () => {
      const html = renderToStaticMarkup(<ToolUseBlock item={makeItem({ status: 'error' })} />);
      expect(html).toContain('border-red-400');
    });

    it('shows tool name in header', () => {
      const html = renderToStaticMarkup(<ToolUseBlock item={makeItem({ tool_name: 'bash' })} />);
      expect(html).toContain('bash');
    });

    it('formats path args with INPUT label', () => {
      const html = renderToStaticMarkup(
        <ToolUseBlock item={makeItem({ status: 'running', args: { path: '/src/foo.ts' } })} />,
      );
      expect(html).toContain('INPUT');
      expect(html).toContain('/src/foo.ts');
    });

    it('formats command args as code block', () => {
      const html = renderToStaticMarkup(
        <ToolUseBlock item={makeItem({ status: 'running', args: { command: 'ls -la' } })} />,
      );
      expect(html).toContain('ls -la');
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd frontend && npx vitest run --config vitest.node.config.ts src/components/workspace/tool-use-block.node.test.tsx
  ```
  Expected: **FAIL** on border-amber-400, border-emerald-400, rounded-full, INPUT tests.

- [ ] **Step 3: Implement the redesign**

  Replace the entire contents of `frontend/src/components/workspace/tool-use-block.tsx`:

  ```tsx
  import { useEffect, useState } from 'react';
  import { FileText, CheckCircle2, XCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
  import { cn } from '@/lib/utils';
  import type { ConversationItem } from '@/lib/types';

  type ToolItem = Extract<ConversationItem, { kind: 'tool_use' }>;

  interface ToolUseBlockProps {
    item: ToolItem;
  }

  function formatToolName(name: string) {
    return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /** Extract a short human-readable hint from the tool's args to show inline. */
  function toolSummary(name: string, args: Record<string, unknown>): string | null {
    const str = (key: string) => {
      const v = args[key];
      return typeof v === 'string' ? v : null;
    };
    const truncate = (s: string, max = 60) =>
      s.length > max ? s.slice(0, max) + '\u2026' : s;

    switch (name) {
      case 'read_file': case 'read':
        return str('path') ? truncate(str('path')!, 50) : null;
      case 'write_file': case 'write':
        return str('path') ? truncate(str('path')!, 50) : null;
      case 'edit_file': case 'edit':
        return str('path') ? truncate(str('path')!, 50) : null;
      case 'shell_exec': case 'exec': case 'bash': {
        const cmd = str('command') ?? str('cmd');
        return cmd ? truncate(cmd) : null;
      }
      case 'web_search':
        return str('query') ? truncate(str('query')!) : null;
      case 'web_fetch': case 'fetch':
        return str('url') ? truncate(str('url')!) : null;
      case 'delegate': case 'delegate_to_agent': {
        const agent = str('agent_name');
        const task = str('task');
        return agent ? (task ? `${agent} \u2014 ${truncate(task, 40)}` : agent) : null;
      }
      default: {
        for (const v of Object.values(args)) {
          if (typeof v === 'string' && v.length > 0) return truncate(v);
        }
        return null;
      }
    }
  }

  /** Render a single arg value formatted by key name. */
  function ArgValue({ argKey, value }: { argKey: string; value: unknown }) {
    const key = argKey.toLowerCase();
    const str = String(value);

    if (key === 'path' || key === 'file_path' || key === 'file') {
      return (
        <span className="flex items-center gap-1 font-mono text-[11px] text-foreground/70 break-all">
          <FileText size={10} className="shrink-0 text-muted-foreground/50" />
          {str}
        </span>
      );
    }
    if (key === 'command' || key === 'cmd') {
      return (
        <code className="block font-mono text-[11px] text-foreground/70 bg-background/50 rounded px-1.5 py-0.5 whitespace-pre-wrap break-words">
          {str}
        </code>
      );
    }
    if (key === 'query' || key === 'search') {
      return <span className="text-[11px] text-muted-foreground/70">{str}</span>;
    }
    return (
      <pre className="text-[11px] text-muted-foreground/70 bg-background/50 rounded px-1.5 py-0.5 whitespace-pre-wrap break-words max-h-32 overflow-y-auto scrollbar-thin">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  export function ToolUseBlock({ item }: ToolUseBlockProps) {
    const isDone = item.status === 'done';
    const isError = item.status === 'error';
    const isRunning = item.status === 'running';

    // Smart collapse: auto-expanded while running, auto-collapsed when done/error.
    // User click overrides until next status change.
    const [userOverride, setUserOverride] = useState<boolean | null>(null);
    const isExpanded = userOverride !== null ? userOverride : isRunning;

    useEffect(() => {
      setUserOverride(null);
    }, [item.status]);

    const args = item.args as Record<string, unknown>;

    return (
      <div className="py-1 animate-in fade-in duration-200">
        <div
          className={cn(
            'rounded-xl border bg-muted/20 overflow-hidden',
            'border-l-4',
            isRunning && 'border-l-amber-400/60 border-border/30',
            isDone && 'border-l-emerald-400/40 border-border/20',
            isError && 'border-l-red-400/40 border-red-500/20',
          )}
        >
          {/* Header — always visible, clickable */}
          <button
            type="button"
            onClick={() => setUserOverride((v) => (v === null ? !isRunning : !v))}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left min-w-0"
          >
            <span className="font-mono text-sm font-medium text-foreground/80 shrink-0">
              {formatToolName(item.tool_name)}
            </span>
            {toolSummary(item.tool_name, args) && (
              <span className="text-[11px] text-muted-foreground/50 truncate font-mono flex-1">
                {toolSummary(item.tool_name, args)}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              {isRunning && <Loader2 size={11} className="text-amber-400 animate-spin" />}
              {isDone && <CheckCircle2 size={11} className="text-emerald-400" />}
              {isError && <XCircle size={11} className="text-red-400" />}
              {isExpanded
                ? <ChevronDown size={11} className="text-muted-foreground/60" />
                : <ChevronRight size={11} className="text-muted-foreground/60" />}
            </div>
          </button>

          {/* Expanded content */}
          {isExpanded && (
            <div className="border-t border-border/20 px-3 pb-3 pt-2 space-y-2.5">
              {/* Input section */}
              {Object.keys(args).length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1.5">
                    Input
                  </p>
                  <div className="space-y-1.5">
                    {Object.entries(args).map(([key, value]) => (
                      <div key={key} className="flex flex-col gap-0.5">
                        <span className="text-[9px] uppercase tracking-widest text-muted-foreground/30">
                          {key}
                        </span>
                        <ArgValue argKey={key} value={value} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Output section */}
              {item.result !== undefined && (
                <div>
                  <p className={cn(
                    'text-[9px] font-bold uppercase tracking-widest mb-1.5',
                    isError ? 'text-red-400/60' : 'text-muted-foreground/40',
                  )}>
                    {isError ? 'Error' : 'Output'}
                  </p>
                  <pre className={cn(
                    'text-[11px] whitespace-pre-wrap break-words rounded-lg p-2 border max-h-48 overflow-y-auto scrollbar-thin',
                    isError
                      ? 'text-red-400/80 bg-red-500/5 border-red-500/20'
                      : 'text-muted-foreground/80 bg-background/50 border-border/20',
                  )}>
                    {item.result}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd frontend && npx vitest run --config vitest.node.config.ts src/components/workspace/tool-use-block.node.test.tsx
  ```
  Expected: **7 tests pass**.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/components/workspace/tool-use-block.tsx \
          frontend/src/components/workspace/tool-use-block.node.test.tsx
  git commit -m "feat(workspace): redesign ToolUseBlock — smart collapse, left border, per-arg input"
  ```

---

## Task 5: ConversationTimeline — spacing, typing indicator, cursor passthrough

Update spacing/typography, replace bouncing dots with a single pulse bar, and pass `showCursor` to the last assistant item while streaming.

**Files:**
- Modify: `frontend/src/components/workspace/conversation-timeline.tsx`
- Create: `frontend/src/components/workspace/conversation-timeline.node.test.tsx`

- [ ] **Step 1: Write failing tests**

  Create `frontend/src/components/workspace/conversation-timeline.node.test.tsx`:

  ```tsx
  import { describe, expect, it } from 'vitest';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { ConversationTimeline } from './conversation-timeline';
  import type { ConversationItem } from '@/lib/types';

  const userItem: ConversationItem = {
    kind: 'user', id: 'u1', content: 'Hello',
  };
  const assistantItem: ConversationItem = {
    kind: 'assistant', id: 'a1', content: 'World', richContent: null, runId: null,
  };

  describe('ConversationTimeline', () => {
    it('uses py-8 container padding', () => {
      const html = renderToStaticMarkup(
        <ConversationTimeline items={[userItem]} isStreaming={false} />,
      );
      expect(html).toContain('py-8');
    });

    it('renders typing indicator as pulse bar (not bouncing dots) when streaming', () => {
      const html = renderToStaticMarkup(
        <ConversationTimeline items={[assistantItem]} isStreaming={true} />,
      );
      // Pulse bar uses animate-pulse with a width class
      expect(html).toContain('animate-pulse');
      // Old dots used animationDelay style — should NOT appear on the typing indicator
      expect(html).not.toContain('animationDelay');
    });

    it('passes showCursor to the last assistant item when streaming', () => {
      const html = renderToStaticMarkup(
        <ConversationTimeline items={[userItem, assistantItem]} isStreaming={true} />,
      );
      // The cursor span should appear (injected by AssistantRichContent when showCursor=true)
      expect(html).toContain('animate-pulse');
      expect(html).toContain('inline-block');
    });

    it('does not show cursor on non-last items', () => {
      const assistantFirst: ConversationItem = {
        kind: 'assistant', id: 'a0', content: 'First', richContent: null, runId: null,
      };
      const assistantLast: ConversationItem = {
        kind: 'assistant', id: 'a1', content: 'Last', richContent: null, runId: null,
      };
      const html = renderToStaticMarkup(
        <ConversationTimeline items={[assistantFirst, assistantLast]} isStreaming={true} />,
      );
      // Cursor should appear exactly once (only for the last item)
      const cursorCount = (html.match(/w-\[2px\]/g) ?? []).length;
      expect(cursorCount).toBe(1);
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd frontend && npx vitest run --config vitest.node.config.ts src/components/workspace/conversation-timeline.node.test.tsx
  ```
  Expected: **FAIL** on py-8, pulse bar, and showCursor tests.

- [ ] **Step 3: Implement the changes**

  Replace the entire contents of `frontend/src/components/workspace/conversation-timeline.tsx`:

  ```tsx
  import { memo, useEffect, useRef } from 'react';
  import { MessageSquare } from 'lucide-react';
  import { cn } from '@/lib/utils';
  import { AssistantRichContent } from './assistant-rich-content';
  import { ThinkingBlock } from './thinking-block';
  import { ToolUseBlock } from './tool-use-block';
  import type { ConversationItem } from '@/lib/types';

  interface ConversationTimelineProps {
    items: ConversationItem[];
    isStreaming?: boolean;
  }

  interface TimelineItemProps {
    item: ConversationItem;
    showCursor?: boolean;
  }

  // Memoized so it only re-renders when its own `item` or `showCursor` ref changes.
  // `showCursor` changes for at most two items per streaming event (new last + old last),
  // preserving the O(1) re-render property during streaming.
  const TimelineItem = memo(function TimelineItem({ item, showCursor }: TimelineItemProps) {
    if (item.kind === 'user') {
      return (
        <div className={cn('flex justify-end py-1', 'mt-6')}>
          <div className="max-w-[80%] flex flex-col items-end gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 pr-1">
              You
            </span>
            <div className="bg-primary/90 text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed shadow-lg shadow-primary/10">
              {item.content}
            </div>
          </div>
        </div>
      );
    }

    if (item.kind === 'assistant') {
      return (
        <div className="flex justify-start py-1">
          <div className="max-w-[85%] flex flex-col items-start gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 pl-1">
              Assistant
            </span>
            <div className="bg-card text-foreground border border-border/40 rounded-[18px] rounded-bl-md px-4 py-3 text-sm shadow-sm">
              <AssistantRichContent
                content={item.content}
                richContent={item.richContent ?? null}
                showCursor={showCursor}
              />
            </div>
          </div>
        </div>
      );
    }

    if (item.kind === 'thinking') {
      return <ThinkingBlock content={item.content} done={item.done} />;
    }

    if (item.kind === 'tool_use') {
      return <ToolUseBlock item={item} />;
    }

    if (item.kind === 'error') {
      return (
        <div className="flex items-center gap-2 py-1 px-2">
          <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            ⚠ {item.message}
          </div>
        </div>
      );
    }

    if (item.kind === 'approval') {
      return (
        <div className="flex justify-start py-1">
          <div className="bg-warning/10 border border-warning/30 rounded-xl px-4 py-3 text-sm space-y-1 max-w-[85%]">
            <p className="font-semibold text-warning text-[12px]">⚡ Approval Required</p>
            <p className="text-muted-foreground/80 text-[12px]">
              Tool: <span className="font-mono text-foreground/70">{item.tool}</span>
            </p>
          </div>
        </div>
      );
    }

    return null;
  });

  export const ConversationTimeline = memo(function ConversationTimeline({
    items,
    isStreaming,
  }: ConversationTimelineProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    }, [items, isStreaming]);

    if (items.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-2">
            <MessageSquare size={22} className="text-primary/60" />
          </div>
          <p className="text-sm font-medium text-foreground/70">Start a conversation</p>
          <p className="text-[12px] text-muted-foreground/60 max-w-xs">
            Send a message and watch the agent team work in real time.
          </p>
        </div>
      );
    }

    const hasLiveThinking = items.some((item) => item.kind === 'thinking' && !item.done);
    const showTypingBubble = isStreaming && !hasLiveThinking;

    return (
      <div ref={containerRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-8 md:px-8">
        <div className="max-w-3xl mx-auto space-y-2 min-h-full flex flex-col justify-end">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            const showCursor = isStreaming === true && isLast && item.kind === 'assistant';
            return (
              <TimelineItem
                key={item.id}
                item={item}
                showCursor={showCursor}
              />
            );
          })}

          {showTypingBubble && (
            <div className="flex justify-start py-1 animate-in fade-in duration-200">
              <div className="bg-card border border-border/40 rounded-xl px-4 py-3 shadow-sm">
                <div className="w-16 h-1 rounded-full bg-muted-foreground/30 animate-pulse" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  });
  ```

- [ ] **Step 4: Run all workspace tests to confirm everything passes**

  ```bash
  cd frontend && npx vitest run --config vitest.node.config.ts src/components/workspace/
  ```
  Expected: **All tests pass** (conversation-timeline + assistant-rich-content + thinking-block + tool-use-block).

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/components/workspace/conversation-timeline.tsx \
          frontend/src/components/workspace/conversation-timeline.node.test.tsx
  git commit -m "feat(workspace): update ConversationTimeline — spacing, pulse bar, cursor passthrough"
  ```

---

## Task 6: Smoke test full suite

Verify no existing tests were broken by the changes.

- [ ] **Step 1: Run existing node tests**

  ```bash
  cd frontend && npx vitest run --config vitest.node.config.ts
  ```
  Expected: All previously passing tests still pass.

- [ ] **Step 2: TypeScript check**

  ```bash
  cd frontend && npm run check:types
  ```
  Expected: No TypeScript errors.

- [ ] **Step 3: Commit if any fixes were needed**

  If steps 1-2 required fixes, commit them:
  ```bash
  git add frontend/src/components/workspace/
  git commit -m "fix(workspace): address type errors from chat redesign"
  ```
