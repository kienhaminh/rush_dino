# Sessions + Context Debug Merge — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the `/context-debug` route into `/sessions` as a master-detail split layout — compact session list on the left, full context debug view on the right.

**Architecture:** `SessionsRoute` absorbs all data-fetching from `ContextDebugRoute` (sessions, soul memory, system prompt, registered tools, conversation messages, runs). `SessionsPage` is replaced with a split-pane layout: a narrow sidebar with compact session rows, and a right panel rendering the existing context debug components. The `/context-debug` route and its page/route files are deleted; the context debug UI components are kept in place.

**Tech Stack:** React, TypeScript, Tailwind CSS, React Router, existing context-debug components (`TokenUsageBar`, `MessageThread`, `SidebarPanels`, `PromptInspector`)

---

## Chunk 1: Remove context-debug from navigation and routing

### Task 1: Remove `context-debug` from navigation config

**Files:**
- Modify: `frontend/src/lib/navigation.ts`

- [ ] **Step 1: Open `frontend/src/lib/navigation.ts` and remove `context-debug` from `TAB_GROUPS`**

  In `TAB_GROUPS`, the `system` group currently reads:
  ```ts
  { label: 'system', tabs: ['config', 'diagnostics', 'nodes', 'debug', 'context-debug'] },
  ```
  Change to:
  ```ts
  { label: 'system', tabs: ['config', 'diagnostics', 'nodes', 'debug'] },
  ```

- [ ] **Step 2: Remove `context-debug` from the `Tab` union type**

  Remove this line from the `Tab` type:
  ```ts
  | 'context-debug'
  ```

- [ ] **Step 3: Remove `context-debug` entries from `TAB_ICONS`, `TAB_LABELS`, `TAB_DESCRIPTIONS`**

  In `TAB_ICONS` remove:
  ```ts
  'context-debug': ScanSearch,
  ```
  In `TAB_LABELS` remove:
  ```ts
  'context-debug': 'Context Debug',
  ```
  In `TAB_DESCRIPTIONS` remove:
  ```ts
  'context-debug': 'Deep-dive into agent context: messages, tool calls, token budget, and memory state',
  ```

- [ ] **Step 4: Remove unused `ScanSearch` import if no other tab uses it**

  Check the `import { ..., ScanSearch }` at the top — remove `ScanSearch` from the import list.

- [ ] **Step 5: Type-check**

  ```bash
  cd frontend && npm run check:types
  ```
  Expected: no errors related to `context-debug` or `ScanSearch`.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/lib/navigation.ts
  git commit -m "feat(nav): remove context-debug tab from navigation"
  ```

---

### Task 2: Remove `/context-debug` route from App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Remove the `ContextDebugRoute` import**

  Remove:
  ```ts
  import { ContextDebugRoute } from './pages/context-debug/ContextDebugRoute';
  ```

- [ ] **Step 2: Remove the route declaration**

  Remove:
  ```tsx
  <Route path="context-debug" element={<ContextDebugRoute />} />
  ```

- [ ] **Step 3: Type-check**

  ```bash
  cd frontend && npm run check:types
  ```
  Expected: passes (the route files still exist on disk, so no missing module error yet — we delete them in Task 5).

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/App.tsx
  git commit -m "feat(routing): remove /context-debug route"
  ```

---

## Chunk 2: Rewrite SessionsRoute with merged data-fetching

### Task 3: Replace `SessionsRoute.tsx` with merged data-fetching logic

**Files:**
- Modify: `frontend/src/pages/sessions/SessionsRoute.tsx`

The new route merges the data concerns from the old `SessionsRoute` (sessions list + delete) and `ContextDebugRoute` (soul memory, system prompt, registered tools, conversation messages, runs, polling).

- [ ] **Step 1: Replace the entire contents of `SessionsRoute.tsx`**

  ```tsx
  import { useCallback, useEffect, useRef, useState } from 'react';
  import { toast } from 'sonner';
  import {
    deleteConversation,
    fetchConversation,
    fetchRegisteredTools,
    fetchSessionRuns,
    fetchSessions,
    fetchSoulMemoryState,
    fetchSystemPrompt,
  } from '@/lib/api';
  import type {
    Message,
    RegisteredTool,
    RunSnapshot,
    SessionSummary,
    SoulMemoryStateResponse,
  } from '@/lib/types';
  import { SessionsPage } from './SessionsPage';

  const POLL_INTERVAL_MS = 30_000;

  export function SessionsRoute() {
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [runs, setRuns] = useState<RunSnapshot[]>([]);
    const [soulMemory, setSoulMemory] = useState<SoulMemoryStateResponse | null>(null);
    const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
    const [registeredTools, setRegisteredTools] = useState<RegisteredTool[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pollingRef = useRef(false);

    // Fetch sessions + soul memory + system prompt
    const refreshMeta = useCallback(async (isInitial = false) => {
      try {
        const [s, mem, prompt, tools] = await Promise.all([
          fetchSessions(),
          fetchSoulMemoryState(),
          fetchSystemPrompt(),
          fetchRegisteredTools(),
        ]);
        setSessions(s);
        setSoulMemory(mem);
        setSystemPrompt(prompt.content);
        setRegisteredTools(tools);
        if (isInitial && s.length > 0) {
          const latest = [...s].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          )[0];
          setSelectedSessionId(latest.id);
        }
      } catch (e) {
        if (isInitial) setError(e instanceof Error ? e.message : 'Failed to load sessions');
      }
    }, []);

    // Mount: load meta
    useEffect(() => {
      refreshMeta(true);
    }, [refreshMeta]);

    // Poll every 30s to keep context window token counts live
    useEffect(() => {
      const id = setInterval(async () => {
        if (pollingRef.current) return;
        pollingRef.current = true;
        try {
          await refreshMeta(false);
        } finally {
          pollingRef.current = false;
        }
      }, POLL_INTERVAL_MS);
      return () => clearInterval(id);
    }, [refreshMeta]);

    // Load conversation + runs when selected session changes
    useEffect(() => {
      if (!selectedSessionId) return;

      async function loadSession() {
        if (!selectedSessionId) return;
        setLoading(true);
        setError(null);
        try {
          const sessionRuns = await fetchSessionRuns(selectedSessionId, 30);
          setRuns(sessionRuns);
          const conversationId = sessionRuns[0]?.conversationId;
          if (conversationId) {
            const conv = await fetchConversation(conversationId);
            setMessages(conv.messages);
          } else {
            setMessages([]);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to load session detail');
        } finally {
          setLoading(false);
        }
      }
      loadSession();
    }, [selectedSessionId, sessions]);

    const handleRefresh = async () => {
      setError(null);
      try {
        await refreshMeta(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Refresh failed');
      }
      setSelectedSessionId((prev) => prev);
    };

    const handleDelete = async (sessionId: string) => {
      if (!window.confirm('Delete this conversation session? This cannot be undone.')) return;
      try {
        await deleteConversation(sessionId);
        toast.success('Session deleted.');
        if (selectedSessionId === sessionId) setSelectedSessionId(null);
        await refreshMeta(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete session.');
      }
    };

    return (
      <SessionsPage
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        messages={messages}
        runs={runs}
        soulMemory={soulMemory}
        systemPrompt={systemPrompt}
        registeredTools={registeredTools}
        loading={loading}
        error={error}
        onSelectSession={setSelectedSessionId}
        onRefresh={handleRefresh}
        onDelete={handleDelete}
      />
    );
  }
  ```

- [ ] **Step 2: IMPORTANT — Task 4 must follow immediately**

  Do not leave this commit on a branch and work on something else. The props contract between `SessionsRoute` and `SessionsPage` will be broken until Task 4 is complete. Proceed to Task 4 without interruption.

- [ ] **Step 3: Commit (type errors expected — resolve in Task 4)**

  ```bash
  git add frontend/src/pages/sessions/SessionsRoute.tsx
  git commit -m "feat(sessions): merge context-debug data fetching into SessionsRoute"
  ```

---

## Chunk 3: Rewrite SessionsPage with master-detail split layout

### Task 4: Replace `SessionsPage.tsx` with master-detail split layout

**Files:**
- Modify: `frontend/src/pages/sessions/SessionsPage.tsx`

The new `SessionsPage` accepts all the props from the new route and renders a two-column layout.

- [ ] **Step 0: Verify context-debug components exist**

  ```bash
  ls frontend/src/pages/context-debug/components/
  ```
  Expected output includes: `TokenUsageBar.tsx`, `MessageThread.tsx`, `SidebarPanels.tsx`, `PromptInspector.tsx`

  These are imported by the new `SessionsPage`. If any are missing, stop and investigate before proceeding.

- [ ] **Step 1: Replace the entire contents of `SessionsPage.tsx`**

  ```tsx
  import { useMemo, useState } from 'react';
  import { RefreshCw, Trash2 } from 'lucide-react';
  import type {
    Message,
    RegisteredTool,
    RunSnapshot,
    SessionSummary,
    SoulMemoryStateResponse,
    ToolCall,
  } from '@/lib/types';
  import { TokenUsageBar } from '../context-debug/components/TokenUsageBar';
  import { MessageThread } from '../context-debug/components/MessageThread';
  import {
    BootstrapFilesPanel,
    RegisteredToolsPanel,
    RunHistoryPanel,
    ToolCallSummaryPanel,
  } from '../context-debug/components/SidebarPanels';
  import { PromptInspector } from '../context-debug/components/PromptInspector';

  // Rough token estimate: ~1 token per 4 chars
  function estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  function fmtTokens(v?: number | null) {
    if (v == null) return '—';
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    return String(v);
  }

  function ctxBarGradient(ratio?: number | null) {
    if (ratio == null) return 'rgba(255,255,255,0.1)';
    if (ratio > 0.85) return 'linear-gradient(90deg,#f59e0b,#ef4444)';
    if (ratio > 0.6) return 'linear-gradient(90deg,#17C4D6,#f59e0b)';
    return 'linear-gradient(90deg,#17C4D6,#0ea5e9)';
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'active': return '#17C4D6';
      case 'awaiting_approval': return '#f59e0b';
      case 'blocked': return '#f87171';
      default: return 'rgba(255,255,255,0.18)';
    }
  }

  /* ─── Compact session row ─────────────────────────────────────────────────── */
  function SessionRow({
    session,
    selected,
    onSelect,
    onDelete,
  }: {
    session: SessionSummary;
    selected: boolean;
    onSelect: () => void;
    onDelete: () => void;
  }) {
    const ratio = session.contextWindow?.usageRatio ?? null;
    const barPct = ratio == null ? 2 : Math.max(2, Math.min(100, ratio * 100));
    const color = statusColor(session.status);
    const limit = session.contextWindow?.limitTokens;
    const used = session.contextWindow?.promptTokens;

    return (
      <div
        onClick={onSelect}
        className="group relative rounded-[8px] px-3 py-2 cursor-pointer transition-all duration-150"
        style={{
          background: selected ? 'rgba(23,196,214,0.08)' : 'transparent',
          border: selected ? '1px solid rgba(23,196,214,0.22)' : '1px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!selected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
        }}
        onMouseLeave={(e) => {
          if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
      >
        {/* Name + status dot */}
        <div className="flex items-center gap-2 pr-6">
          <span
            className="w-[6px] h-[6px] rounded-full flex-shrink-0"
            style={{ background: color }}
          />
          <span
            className="text-[12px] font-medium truncate"
            style={{ color: selected ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.65)' }}
          >
            {session.title || session.id.slice(0, 20)}
          </span>
        </div>

        {/* Token bar */}
        <div className="mt-[6px] h-[2px] rounded-sm bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-sm transition-all duration-500"
            style={{ width: `${barPct}%`, background: ctxBarGradient(ratio) }}
          />
        </div>
        <div className="mt-[3px] text-[9px] text-muted-foreground/40">
          {used != null && limit != null
            ? `${fmtTokens(used)} / ${fmtTokens(limit)}`
            : limit != null
              ? `${fmtTokens(limit)} max`
              : 'no measurements'}
        </div>

        {/* Hover-reveal delete */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-2 top-2 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'rgba(248,113,113,0.6)' }}
          title="Delete session"
        >
          <Trash2 size={10} />
        </button>
      </div>
    );
  }

  /* ─── Chip ────────────────────────────────────────────────────────────────── */
  function Chip({ children, color, bg, border }: { children: React.ReactNode; color: string; bg: string; border: string }) {
    return (
      <span
        className="text-[9px] font-semibold tracking-[0.09em] px-[6px] py-[2px] rounded-[4px]"
        style={{ color, background: bg, border: `1px solid ${border}` }}
      >
        {children}
      </span>
    );
  }

  /* ─── Page ────────────────────────────────────────────────────────────────── */
  type SessionsPageProps = {
    sessions: SessionSummary[];
    selectedSessionId: string | null;
    messages: Message[];
    runs: RunSnapshot[];
    soulMemory: SoulMemoryStateResponse | null;
    systemPrompt: string | null;
    registeredTools: RegisteredTool[];
    loading: boolean;
    error: string | null;
    onSelectSession: (id: string) => void;
    onRefresh: () => void;
    onDelete: (sessionId: string) => void;
  };

  export function SessionsPage({
    sessions,
    selectedSessionId,
    messages,
    runs,
    soulMemory,
    systemPrompt,
    registeredTools,
    loading,
    error,
    onSelectSession,
    onRefresh,
    onDelete,
  }: SessionsPageProps) {
    const [testMessages, setTestMessages] = useState<Message[]>([]);

    // Reset test messages when session changes
    useMemo(() => { setTestMessages([]); }, [selectedSessionId]);

    const allMessages = useMemo(() => [...messages, ...testMessages], [messages, testMessages]);

    const allToolCalls = useMemo(() => {
      const calls: { msgIndex: number; call: ToolCall }[] = [];
      allMessages.forEach((msg, i) => {
        (msg.tool_calls ?? []).forEach((tc) => calls.push({ msgIndex: i, call: tc }));
      });
      return calls;
    }, [allMessages]);

    const systemPromptTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
    const estimatedPromptTokens = useMemo(
      () => systemPromptTokens + allMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0),
      [systemPromptTokens, allMessages],
    );

    const handleAddTestMessage = (role: 'user' | 'assistant', content: string) => {
      const newMessage: Message = {
        id: `test-${Date.now()}`,
        role,
        content,
        created_at: new Date().toISOString(),
      };
      setTestMessages((prev) => [...prev, newMessage]);
    };

    const handleExportJson = () => {
      const data = { sessionId: selectedSessionId, systemPrompt, messages: allMessages, estimatedTokens: estimatedPromptTokens };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `context-${selectedSessionId}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const activeCount = sessions.filter((s) => s.status === 'active').length;
    const awaitingCount = sessions.filter((s) => s.status === 'awaiting_approval').length;
    const session = sessions.find((s) => s.id === selectedSessionId);

    return (
      <div className="flex h-full w-full overflow-hidden">
        {/* ── Left sidebar: compact session list ───────────────────────────── */}
        <div
          className="flex flex-col h-full shrink-0 border-r border-white/[0.07]"
          style={{ width: '260px' }}
        >
          {/* Sidebar header */}
          <div className="px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-semibold text-foreground tracking-[-0.01em]">
                Sessions
              </span>
              <button
                onClick={onRefresh}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                title="Refresh"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="flex gap-[5px] flex-wrap">
              <Chip color="rgba(255,255,255,0.4)" bg="rgba(255,255,255,0.06)" border="rgba(255,255,255,0.08)">
                {sessions.length} TOTAL
              </Chip>
              {activeCount > 0 && (
                <Chip color="rgba(23,196,214,0.9)" bg="rgba(23,196,214,0.08)" border="rgba(23,196,214,0.22)">
                  {activeCount} ACTIVE
                </Chip>
              )}
              {awaitingCount > 0 && (
                <Chip color="rgba(245,158,11,0.9)" bg="rgba(245,158,11,0.08)" border="rgba(245,158,11,0.22)">
                  {awaitingCount} AWAITING
                </Chip>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-3 mt-2 px-3 py-2 rounded-[8px] bg-red-400/[0.06] border border-red-400/[0.18] text-[11px] text-red-400/85 flex-shrink-0">
              {error}
            </div>
          )}

          {/* Session rows */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-[2px]">
            {sessions.length === 0 ? (
              <div className="px-3 py-8 text-center text-[11px] text-muted-foreground/40">
                No sessions found
              </div>
            ) : (
              sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  selected={s.id === selectedSessionId}
                  onSelect={() => onSelectSession(s.id)}
                  onDelete={() => onDelete(s.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Right panel: context debug ────────────────────────────────────── */}
        <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col gap-4 p-4">
          {!selectedSessionId ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a session to inspect its context
            </div>
          ) : (
            <>
              {/* Right panel header */}
              <div className="flex items-center justify-between gap-3 flex-shrink-0">
                <div>
                  <h1 className="text-lg font-semibold">
                    {session?.title || selectedSessionId.slice(0, 20)}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Conversation context, tool calls, and memory state
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportJson}
                    className="text-[10px] px-2 py-1 border border-border rounded hover:bg-muted transition-colors uppercase font-bold"
                  >
                    Export JSON
                  </button>
                  <PromptInspector systemPrompt={systemPrompt} messages={allMessages} />
                </div>
              </div>

              {/* Token usage bar */}
              {session && (
                <div className="flex-shrink-0">
                  <TokenUsageBar
                    session={session}
                    estimatedPromptTokens={estimatedPromptTokens}
                    systemPromptTokens={systemPromptTokens}
                    messageCount={allMessages.length}
                    toolCallCount={allToolCalls.length}
                    runCount={runs.length}
                  />
                </div>
              )}

              {/* Main body */}
              {loading ? (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : (
                <div className="flex-1 grid grid-cols-[1fr_320px] gap-4 overflow-hidden min-h-0">
                  <MessageThread
                    messages={allMessages}
                    systemPrompt={systemPrompt}
                    onAddTestMessage={handleAddTestMessage}
                  />
                  <div className="flex flex-col gap-4 overflow-y-auto pr-1">
                    <BootstrapFilesPanel soulMemory={soulMemory} />
                    <ToolCallSummaryPanel toolCalls={allToolCalls} />
                    <RunHistoryPanel runs={runs} />
                    <RegisteredToolsPanel tools={registeredTools} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  export default SessionsPage;
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd frontend && npm run check:types
  ```
  Expected: passes with no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/pages/sessions/SessionsPage.tsx
  git commit -m "feat(sessions): replace SessionsPage with master-detail context debug layout"
  ```

---

## Chunk 4: Delete context-debug page and route files

### Task 5: Delete `ContextDebugRoute.tsx` and `ContextDebugPage.tsx`

**Files:**
- Delete: `frontend/src/pages/context-debug/ContextDebugRoute.tsx`
- Delete: `frontend/src/pages/context-debug/ContextDebugPage.tsx`
- Keep: `frontend/src/pages/context-debug/components/` (all files)

- [ ] **Step 1: Confirm what stays — the `components/` folder is kept intact**

  These files are kept (imported by the new `SessionsPage`):
  - `frontend/src/pages/context-debug/components/TokenUsageBar.tsx`
  - `frontend/src/pages/context-debug/components/MessageThread.tsx`
  - `frontend/src/pages/context-debug/components/SidebarPanels.tsx`
  - `frontend/src/pages/context-debug/components/PromptInspector.tsx`
  - `frontend/src/pages/context-debug/components/SystemPromptPanel.tsx` (kept even if not directly imported — used internally)

  Only delete the page and route files:
  ```bash
  rm frontend/src/pages/context-debug/ContextDebugRoute.tsx
  rm frontend/src/pages/context-debug/ContextDebugPage.tsx
  ```

- [ ] **Step 2: Check no existing tests reference the deleted files**

  ```bash
  grep -r "ContextDebugRoute\|ContextDebugPage" frontend/src frontend/tests --include="*.ts" --include="*.tsx" -l
  ```
  Expected: no output. If files appear, inspect and update/remove the references before continuing.

- [ ] **Step 4: Type-check to confirm no dangling imports**

  ```bash
  cd frontend && npm run check:types
  ```
  Expected: passes. (We removed the import in App.tsx in Task 2.)

- [ ] **Step 5: Commit**

  ```bash
  git add -A frontend/src/pages/context-debug/
  git commit -m "chore: delete ContextDebugRoute and ContextDebugPage (merged into SessionsPage)"
  ```

---

## Chunk 5: Final verification

### Task 6: Build and verify

- [ ] **Step 1: Full type check**

  ```bash
  cd frontend && npm run check:types
  ```
  Expected: zero errors.

- [ ] **Step 2: Build**

  ```bash
  cd frontend && npm run build
  ```
  Expected: build succeeds with no errors.

- [ ] **Step 3: Smoke test in browser**

  Start the dev server (`npm run dev`) and verify:
  - Navigating to `/sessions` shows the split layout — compact list on the left, context panel on the right
  - The most recently updated session is auto-selected
  - Clicking a different session updates the right panel
  - Token bar, message thread, sidebar panels (tool calls, runs, bootstrap files, registered tools) all render
  - Hover over a session row shows the delete button; clicking it prompts confirmation and removes the session
  - Refresh button (top-right of sidebar) re-fetches sessions
  - Export JSON button downloads a file
  - Navigating to `/context-debug` shows a 404 (route removed)
  - The app sidebar no longer shows "Context Debug" link

- [ ] **Step 4: Final commit**

  ```bash
  git add -A
  git commit -m "feat(sessions): merge context debug into sessions — master-detail layout complete"
  ```
