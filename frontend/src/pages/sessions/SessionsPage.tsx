import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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
function Chip({ children, color, bg, border }: { children: ReactNode; color: string; bg: string; border: string }) {
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
  useEffect(() => { setTestMessages([]); }, [selectedSessionId]);

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
