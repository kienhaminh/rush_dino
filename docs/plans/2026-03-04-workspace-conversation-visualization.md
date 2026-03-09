# Workspace Conversation Visualization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the flat chat bubble UI into a rich agentic conversation timeline with per-tool visualization, thinking state, and live agent badge tracking.

**Architecture:** Add `ToolStart`/`ToolEnd` WS events on the backend (rust), thread the event sender through `append_tool_outputs` in `react_loop.rs`, then completely redesign the frontend workspace around a `ConversationItem` union type that renders user/assistant messages, thinking blocks, and tool-use cards in a vertical timeline.

**Tech Stack:** Rust (tokio/axum/serde_json), React 18, TypeScript, Tailwind CSS, shadcn/ui, lucide-react, framer-motion (already in project or use CSS animations)

---

## Task 1: Backend — Add ToolStart/ToolEnd to StreamingEvent

**Files:**
- Modify: `crates/agent/src/react_loop.rs`

**Step 1: Add new variants to `StreamingEvent`**

In `react_loop.rs`, find the `StreamingEvent` enum (line 28) and add two new variants:

```rust
#[derive(Debug, Clone)]
pub enum StreamingEvent {
    ChatChunk(ChatChunk),
    AssistantReset,
    ToolStart { tool_name: String, args: serde_json::Value },
    ToolEnd { tool_name: String, result: String, is_error: bool },
}
```

**Step 2: Update `append_tool_outputs` signature to accept event_tx**

Change the function signature from:
```rust
async fn append_tool_outputs(
    messages: &mut Vec<Message>,
    registry: Arc<ToolRegistry>,
    calls: Vec<ToolCall>,
    base_taint: TaintLevel,
)
```
to:
```rust
async fn append_tool_outputs(
    messages: &mut Vec<Message>,
    registry: Arc<ToolRegistry>,
    calls: Vec<ToolCall>,
    base_taint: TaintLevel,
    event_tx: Option<mpsc::Sender<StreamingEvent>>,
)
```

**Step 3: Emit ToolStart before and ToolEnd after each tool call**

Inside the `futures` iterator in `append_tool_outputs`, wrap tool execution with events. The core logic becomes:

```rust
async move {
    // ... taint checks (keep existing) ...

    // Emit ToolStart before executing
    if let Some(tx) = &event_tx {
        let _ = tx.send(StreamingEvent::ToolStart {
            tool_name: call.name.clone(),
            args: serde_json::to_value(&call.arguments).unwrap_or(serde_json::Value::Null),
        }).await;
    }

    let (result, is_error) = if let Some(tool) = registry.get(&call.name) {
        match tool.execute(call.arguments.clone()).await {
            Ok(value) => (value, false),
            Err(err) => (err.to_string(), true),
        }
    } else {
        ("tool not found".to_owned(), true)
    };

    // Emit ToolEnd after executing
    if let Some(tx) = &event_tx {
        let _ = tx.send(StreamingEvent::ToolEnd {
            tool_name: call.name.clone(),
            result: result.clone(),
            is_error,
        }).await;
    }

    (call, result, is_error)
}
```

Note: The `event_tx` needs to be cloned into each async closure. Use `let event_tx = event_tx.clone();` before the `futures` map.

**Step 4: Update the non-streaming call to `append_tool_outputs` (pass `None`)**

In `run_react_loop` (line ~59):
```rust
append_tool_outputs(&mut messages, registry.clone(), response.tool_calls.clone(), base_taint, None).await;
```

**Step 5: Update the streaming call to `append_tool_outputs` (pass `Some(event_tx.clone())`)**

In `run_react_loop_streaming` (line ~154):
```rust
append_tool_outputs(&mut messages, registry.clone(), response.tool_calls.clone(), base_taint, Some(event_tx.clone())).await;
```

**Step 6: Build and verify it compiles**

```bash
cd /Users/kien.ha/Code/RushDino && cargo build -p rushdino-agent 2>&1 | tail -20
```
Expected: no errors (warnings OK)

---

## Task 2: Backend — Propagate ToolStart/ToolEnd through WsStreamEvent

**Files:**
- Modify: `crates/agent/src/engine.rs`

**Step 1: Add new variants to `WsStreamEvent`**

Find `WsStreamEvent` (around line 69) and add:
```rust
#[derive(Debug, Clone)]
pub enum WsStreamEvent {
    ChatChunk(ChatChunk),
    AssistantReset,
    ToolStart { tool_name: String, args: serde_json::Value },
    ToolEnd { tool_name: String, result: String, is_error: bool },
}
```

**Step 2: Update the StreamingEvent → WsStreamEvent mapping in `stream_chat_via_ws`**

Find the match block (around line 280):
```rust
StreamingEvent::ChatChunk(chunk) => WsStreamEvent::ChatChunk(chunk),
StreamingEvent::AssistantReset => WsStreamEvent::AssistantReset,
StreamingEvent::ToolStart { tool_name, args } => WsStreamEvent::ToolStart { tool_name, args },
StreamingEvent::ToolEnd { tool_name, result, is_error } => WsStreamEvent::ToolEnd { tool_name, result, is_error },
```

**Step 3: Build and verify**

```bash
cd /Users/kien.ha/Code/RushDino && cargo build -p rushdino-agent 2>&1 | tail -20
```

---

## Task 3: Backend — Serialize new events in the WS handler

**Files:**
- Modify: `crates/server/src/ws.rs`

**Step 1: Add new match arms in the event relay task**

Find the match on `WsStreamEvent` (around line 90 in ws.rs), add:
```rust
WsStreamEvent::ToolStart { tool_name, args } => {
    let _ = outbound_tx_clone
        .send(serde_json::json!({
            "type": "tool_start",
            "tool_name": tool_name,
            "args": args,
        }))
        .await;
}
WsStreamEvent::ToolEnd { tool_name, result, is_error } => {
    let _ = outbound_tx_clone
        .send(serde_json::json!({
            "type": "tool_end",
            "tool_name": tool_name,
            "result": result,
            "is_error": is_error,
        }))
        .await;
}
```

**Step 2: Build the full server crate**

```bash
cd /Users/kien.ha/Code/RushDino && cargo build -p rushdino-server 2>&1 | tail -20
```
Expected: no errors

---

## Task 4: Frontend — Update types.ts with new WS events and ConversationItem

**Files:**
- Modify: `frontend/src/lib/types.ts`

**Step 1: Add WsEvent union type and ConversationItem union type**

Append to `types.ts` (after existing types):

```typescript
// ---------------------------------------------------------------------------
// Workspace conversation types — richer than flat Message[]
// ---------------------------------------------------------------------------

export type WsEventType =
  | 'chat_chunk'
  | 'assistant_reset'
  | 'tool_start'
  | 'tool_end'
  | 'approval_request'
  | 'approval_result'
  | 'error';

export interface WsChatChunkEvent {
  type: 'chat_chunk';
  conversation_id: string;
  delta: string;
  tool_calls: ToolCall[];
  done: boolean;
}
export interface WsAssistantResetEvent { type: 'assistant_reset'; conversation_id: string }
export interface WsToolStartEvent { type: 'tool_start'; tool_name: string; args: Record<string, unknown> }
export interface WsToolEndEvent { type: 'tool_end'; tool_name: string; result: string; is_error: boolean }
export interface WsApprovalRequestEvent {
  type: 'approval_request';
  request_id: string;
  conversation_id: string;
  tool: string;
  args: Record<string, unknown>;
}
export interface WsErrorEvent { type: 'error'; message: string }

export type WsEvent =
  | WsChatChunkEvent
  | WsAssistantResetEvent
  | WsToolStartEvent
  | WsToolEndEvent
  | WsApprovalRequestEvent
  | WsErrorEvent;

// A ConversationItem is one row in the visual timeline
export type ConversationItem =
  | { kind: 'user'; id: string; content: string }
  | { kind: 'assistant'; id: string; content: string }
  | { kind: 'thinking'; id: string }
  | { kind: 'tool_use'; id: string; tool_name: string; args: Record<string, unknown>; result?: string; is_error?: boolean; status: 'running' | 'done' | 'error' }
  | { kind: 'approval'; id: string; request_id: string; tool: string; args: Record<string, unknown> }
  | { kind: 'error'; id: string; message: string };

// Derived from delegate_to_agent tool calls — which agent is currently active
export interface ActiveAgent {
  name: string;
  role: 'orchestrator' | 'delegate';
}
```

**Step 2: Keep the legacy `Message` and `ChatChunk` types unchanged** — they are used by other parts of the app.

---

## Task 5: Frontend — Rewrite use-websocket.ts to produce ConversationItem[]

**Files:**
- Modify: `frontend/src/hooks/use-websocket.ts`

**Step 1: Replace the entire hook implementation**

The hook needs to:
1. Build `ConversationItem[]` instead of `Message[]` 
2. Handle all WS event types
3. Track the current active agent name
4. Maintain `tool_use` items (update in-place when `tool_end` arrives)
5. Still expose `sendMessage`, `isConnected`, `isStreaming`

New implementation:

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveAgent, ConversationItem, WsEvent } from '../lib/types';

function buildWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/api/ws/chat`;
}

export function useWebSocket(activeConversationId: string | null) {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [activeAgent, setActiveAgent] = useState<ActiveAgent>({ name: 'Orchestrator', role: 'orchestrator' });
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef(0);

  const connect = useCallback(() => {
    const socket = new WebSocket(buildWsUrl());
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectRef.current = 0;
      setIsConnected(true);
    };

    socket.onclose = () => {
      setIsConnected(false);
      const wait = Math.min(1000 * 2 ** reconnectRef.current, 30_000);
      reconnectRef.current += 1;
      window.setTimeout(connect, wait);
    };

    socket.onmessage = (event) => {
      const msg: WsEvent = JSON.parse(event.data);

      if (msg.type === 'chat_chunk') {
        if (msg.done) {
          setIsStreaming(false);
          // Reset agent back to orchestrator when response is complete
          setActiveAgent({ name: 'Orchestrator', role: 'orchestrator' });
          return;
        }
        if (!msg.delta) return;
        setItems((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.kind === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: last.content + msg.delta }];
          }
          return [...prev, { kind: 'assistant', id: crypto.randomUUID(), content: msg.delta }];
        });
        return;
      }

      if (msg.type === 'assistant_reset') {
        // Agent is looping — show a thinking block
        setItems((prev) => [
          ...prev,
          { kind: 'thinking', id: crypto.randomUUID() },
        ]);
        return;
      }

      if (msg.type === 'tool_start') {
        // Track agent switching when delegate_to_agent is called
        if (msg.tool_name === 'delegate_to_agent') {
          const agentName = (msg.args as Record<string, string>).agent_name ?? 'Agent';
          setActiveAgent({ name: agentName, role: 'delegate' });
        }
        setItems((prev) => [
          ...prev,
          {
            kind: 'tool_use',
            id: `tool-${msg.tool_name}-${Date.now()}`,
            tool_name: msg.tool_name,
            args: msg.args,
            status: 'running',
          },
        ]);
        return;
      }

      if (msg.type === 'tool_end') {
        // When delegate_to_agent finishes, revert to orchestrator
        if (msg.tool_name === 'delegate_to_agent') {
          setActiveAgent({ name: 'Orchestrator', role: 'orchestrator' });
        }
        // Update the matching tool_use item (most recent with matching tool_name)
        setItems((prev) => {
          const idx = [...prev].reverse().findIndex(
            (it) => it.kind === 'tool_use' && it.tool_name === msg.tool_name && it.status === 'running'
          );
          if (idx === -1) return prev;
          const realIdx = prev.length - 1 - idx;
          const updated = { ...prev[realIdx], result: msg.result, is_error: msg.is_error, status: (msg.is_error ? 'error' : 'done') as 'done' | 'error' };
          return [...prev.slice(0, realIdx), updated, ...prev.slice(realIdx + 1)];
        });
        return;
      }

      if (msg.type === 'approval_request') {
        setItems((prev) => [
          ...prev,
          { kind: 'approval', id: crypto.randomUUID(), request_id: msg.request_id, tool: msg.tool, args: msg.args },
        ]);
        return;
      }

      if (msg.type === 'error') {
        setItems((prev) => [
          ...prev,
          { kind: 'error', id: crypto.randomUUID(), message: msg.message },
        ]);
        setIsStreaming(false);
        return;
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => socketRef.current?.close();
  }, [connect]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
      setItems((prev) => [...prev, { kind: 'user', id: crypto.randomUUID(), content: text }]);
      setIsStreaming(true);
      setActiveAgent({ name: 'Orchestrator', role: 'orchestrator' });
      socketRef.current.send(JSON.stringify({ conversation_id: activeConversationId, message: text }));
    },
    [activeConversationId],
  );

  const clearItems = useCallback(() => setItems([]), []);

  return useMemo(
    () => ({ items, activeAgent, sendMessage, clearItems, isConnected, isStreaming }),
    [items, activeAgent, sendMessage, clearItems, isConnected, isStreaming],
  );
}
```

---

## Task 6: Frontend — Create workspace component directory and blocks

**Files:**
- Create: `frontend/src/components/workspace/thinking-block.tsx`
- Create: `frontend/src/components/workspace/tool-use-block.tsx`
- Create: `frontend/src/components/workspace/agent-badge.tsx`
- Create: `frontend/src/components/workspace/conversation-timeline.tsx`

### 6a: thinking-block.tsx

Animated "thinking" indicator that appears between ReAct loop iterations.

```tsx
import { Brain } from 'lucide-react';

export function ThinkingBlock() {
  return (
    <div className="flex items-center gap-3 py-1 px-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="w-7 h-7 rounded-full bg-muted/60 border border-border/40 flex items-center justify-center shrink-0">
        <Brain size={13} className="text-muted-foreground animate-pulse" />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground/70 font-medium">Thinking</span>
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full bg-muted-foreground/50 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
```

### 6b: tool-use-block.tsx

Expandable card that shows tool name, args, and result (when available).

```tsx
import { useState } from 'react';
import { Terminal, CheckCircle2, XCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationItem } from '@/lib/types';

type ToolItem = Extract<ConversationItem, { kind: 'tool_use' }>;

interface ToolUseBlockProps {
  item: ToolItem;
}

function formatToolName(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ToolUseBlock({ item }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const isDone = item.status === 'done';
  const isError = item.status === 'error';
  const isRunning = item.status === 'running';

  return (
    <div className="flex items-start gap-3 py-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="w-7 h-7 rounded-full bg-muted/60 border border-border/40 flex items-center justify-center shrink-0 mt-0.5">
        <Terminal size={12} className={cn(
          isRunning && 'text-amber-400 animate-pulse',
          isDone && 'text-emerald-400',
          isError && 'text-red-400',
        )} />
      </div>

      <div
        className={cn(
          'flex-1 rounded-xl border bg-muted/30 overflow-hidden transition-all duration-200',
          'hover:border-border/60 cursor-pointer',
          isError ? 'border-red-500/20' : 'border-border/30',
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-[12px] font-semibold text-foreground/80">
            {formatToolName(item.tool_name)}
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            {isRunning && <Loader2 size={11} className="text-amber-400 animate-spin" />}
            {isDone && <CheckCircle2 size={11} className="text-emerald-400" />}
            {isError && <XCircle size={11} className="text-red-400" />}
            {expanded ? (
              <ChevronDown size={11} className="text-muted-foreground/60" />
            ) : (
              <ChevronRight size={11} className="text-muted-foreground/60" />
            )}
          </div>
        </div>

        {/* Expanded: args + result */}
        {expanded && (
          <div className="border-t border-border/20 px-3 pb-3 pt-2 space-y-2">
            {Object.keys(item.args).length > 0 && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">Input</p>
                <pre className="text-[11px] text-muted-foreground/80 whitespace-pre-wrap break-words bg-background/50 rounded-lg p-2 border border-border/20 max-h-32 overflow-y-auto">
                  {JSON.stringify(item.args, null, 2)}
                </pre>
              </div>
            )}
            {item.result !== undefined && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">
                  {isError ? 'Error' : 'Output'}
                </p>
                <pre className={cn(
                  'text-[11px] whitespace-pre-wrap break-words bg-background/50 rounded-lg p-2 border border-border/20 max-h-32 overflow-y-auto',
                  isError ? 'text-red-400/80' : 'text-muted-foreground/80',
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

### 6c: agent-badge.tsx

Small animated badge showing the current agent name and role.

```tsx
import { Bot, User2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActiveAgent } from '@/lib/types';

interface AgentBadgeProps {
  agent: ActiveAgent;
  isStreaming?: boolean;
}

export function AgentBadge({ agent, isStreaming }: AgentBadgeProps) {
  const isDelegate = agent.role === 'delegate';

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all duration-300',
      isDelegate
        ? 'bg-violet-500/10 border-violet-500/20 text-violet-400'
        : 'bg-primary/10 border-primary/20 text-primary/80',
    )}>
      <Bot size={11} className={cn(isStreaming && 'animate-pulse')} />
      <span>{agent.name}</span>
      {isDelegate && (
        <span className="text-[9px] font-normal opacity-60 ml-0.5">delegate</span>
      )}
    </div>
  );
}
```

### 6d: conversation-timeline.tsx

The main timeline that renders all `ConversationItem[]` types. Import all blocks here.

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useRef } from 'react';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThinkingBlock } from './thinking-block';
import { ToolUseBlock } from './tool-use-block';
import type { ConversationItem } from '@/lib/types';

interface ConversationTimelineProps {
  items: ConversationItem[];
}

export function ConversationTimeline({ items }: ConversationTimelineProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-2">
          <User size={22} className="text-primary/60" />
        </div>
        <p className="text-sm font-medium text-foreground/70">Start a conversation</p>
        <p className="text-[12px] text-muted-foreground/60 max-w-xs">
          Send a message and watch the agent team work in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 md:px-8">
      <div className="max-w-3xl mx-auto space-y-1 min-h-full flex flex-col justify-end">
        {items.map((item) => {
          if (item.kind === 'user') {
            return (
              <div key={item.id} className="flex justify-end py-1 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="max-w-[80%] flex flex-col items-end gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 pr-1">You</span>
                  <div className="bg-primary text-primary-foreground rounded-[18px] rounded-br-md px-4 py-2.5 text-sm leading-relaxed shadow-lg shadow-primary/10">
                    {item.content}
                  </div>
                </div>
              </div>
            );
          }

          if (item.kind === 'assistant') {
            return (
              <div key={item.id} className="flex justify-start py-1 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="max-w-[85%] flex flex-col items-start gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 pl-1">Assistant</span>
                  <div className={cn(
                    'bg-card text-foreground border border-border/40 rounded-[18px] rounded-bl-md px-4 py-3 text-sm shadow-sm',
                    'prose prose-invert prose-sm max-w-none',
                    'prose-p:leading-relaxed prose-p:my-1',
                    'prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/40 prose-pre:rounded-lg',
                    'prose-code:text-primary/90 prose-code:bg-muted/40 prose-code:px-1 prose-code:rounded',
                  )}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          }

          if (item.kind === 'thinking') {
            return <ThinkingBlock key={item.id} />;
          }

          if (item.kind === 'tool_use') {
            return <ToolUseBlock key={item.id} item={item} />;
          }

          if (item.kind === 'error') {
            return (
              <div key={item.id} className="flex items-center gap-2 py-1 px-2 animate-in fade-in duration-200">
                <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  ⚠ {item.message}
                </div>
              </div>
            );
          }

          if (item.kind === 'approval') {
            return (
              <div key={item.id} className="flex justify-start py-1 animate-in fade-in duration-200">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm space-y-1 max-w-[85%]">
                  <p className="font-semibold text-amber-400 text-[12px]">⚡ Approval Required</p>
                  <p className="text-muted-foreground/80 text-[12px]">Tool: <span className="font-mono text-foreground/70">{item.tool}</span></p>
                </div>
              </div>
            );
          }

          return null;
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

---

## Task 7: Frontend — Update ChatPage.tsx

**Files:**
- Modify: `frontend/src/pages/chat/ChatPage.tsx`

**Step 1: Replace MessageList with ConversationTimeline and add AgentBadge**

New implementation:

```tsx
import { ConversationTimeline } from '@/components/workspace/conversation-timeline';
import { AgentBadge } from '@/components/workspace/agent-badge';
import { ChatInput } from '@/components/chat/chat-input';
import { useWebSocket } from '@/hooks/use-websocket';

export function ChatPage() {
  const activeId = null;
  const { items, activeAgent, sendMessage, isConnected, isStreaming } = useWebSocket(activeId);

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden bg-background relative">
      <div className="flex-1 flex flex-col min-w-0 h-full relative">

        {/* Agent status bar */}
        {isStreaming && (
          <div className="flex items-center gap-2 px-6 py-2 border-b border-border/20 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <span className="text-[11px] text-muted-foreground/50">Active agent:</span>
            <AgentBadge agent={activeAgent} isStreaming={isStreaming} />
          </div>
        )}

        <ConversationTimeline items={items} />

        {/* Input area */}
        <div className="p-4 md:p-6 pb-8 border-t border-border/10">
          <div className="max-w-3xl mx-auto">
            <ChatInput onSend={sendMessage} disabled={isStreaming || !isConnected} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Lint check**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit 2>&1 | head -40
```

---

## Task 8: Frontend — Build and verify

**Step 1: Install deps if needed and build**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npm run build 2>&1 | tail -30
```
Expected: No TS errors. Build succeeds.

**Step 2: Start dev server and verify in browser**

```bash
cd /Users/kien.ha/Code/RushDino && cargo run -p rushdino-server 2>&1 &
cd /Users/kien.ha/Code/RushDino/frontend && npm run dev
```

Open `http://localhost:5173` and verify:
- Workspace page shows the new timeline
- Sending a message shows user bubble on the right
- Streaming response appears on the left
- When tool use occurs: tool card appears with "running" spinner, then updates to "done"
- When agent loops: thinking block appears between iterations
- When delegate_to_agent is called: agent badge shows the delegate name

---

## Review Checklist

- [ ] Backend compiles without errors
- [ ] `ToolStart` and `ToolEnd` WS events emitted during tool execution
- [ ] Frontend TypeScript compiles without errors
- [ ] Timeline renders all item kinds correctly
- [ ] Tool cards expand/collapse to show args/result
- [ ] Thinking block appears on AssistantReset
- [ ] Agent badge updates on delegate_to_agent tool call
- [ ] No duplicate WebSocket connections (WsStatusProvider issue noted — can be addressed separately)
