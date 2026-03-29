import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import type {
  Message,
  RegisteredTool,
  RunSnapshot,
  SessionSummary,
  SoulMemoryStateResponse,
  SystemSummaryResponse,
  ToolCall,
} from '@/lib/types';
import { getCatalogModels } from '@/lib/model-catalog';
import { TokenUsageBar } from '../context-debug/components/TokenUsageBar';
import { MessageThread } from '../context-debug/components/MessageThread';
import {
  RegisteredToolsPanel,
  RunHistoryPanel,
  ToolCallSummaryPanel,
} from '../context-debug/components/SidebarPanels';

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
  if (ratio == null) return 'hsl(var(--border))';
  if (ratio > 0.85) return 'linear-gradient(90deg,#f59e0b,#ef4444)';
  if (ratio > 0.6) return 'linear-gradient(90deg,#17C4D6,#f59e0b)';
  return 'linear-gradient(90deg,#17C4D6,#0ea5e9)';
}

function statusColor(status: string): string {
  switch (status) {
    case 'active': return '#17C4D6';
    case 'awaiting_approval': return '#f59e0b';
    case 'awaiting_input': return '#f59e0b';
    case 'blocked': return '#f87171';
    case 'idle': return 'hsl(var(--muted-foreground) / 0.4)';
    default: return 'hsl(var(--muted-foreground) / 0.25)';
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
      className={`group relative rounded-[8px] px-3 py-2 cursor-pointer transition-all duration-150 border ${selected ? 'border-primary/20 bg-primary/[0.06]' : 'border-transparent hover:bg-muted/50'}`}
    >
      {/* Name + status dot */}
      <div className="flex items-center gap-2 pr-6">
        <span
          className="w-[6px] h-[6px] rounded-full flex-shrink-0"
          style={{ background: color }}
        />
        <span className={`text-[12px] font-medium truncate ${selected ? 'text-foreground' : 'text-foreground/70'}`}>
          {session.title || session.id.slice(0, 20)}
        </span>
      </div>

      {/* Token bar */}
      <div className="mt-[6px] h-[2px] rounded-sm bg-border overflow-hidden">
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

      {/* Hover-reveal delete (hidden for main session) */}
      {session.id !== 'main' && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-2 top-2 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-destructive/60"
          title="Delete session"
        >
          <Trash2 size={10} />
        </button>
      )}
    </div>
  );
}

/* ─── Thinking level segmented control ───────────────────────────────────── */
const THINKING_LEVELS = [
  { value: 'off',      label: 'off' },
  { value: 'minimal',  label: 'min' },
  { value: 'low',      label: 'low' },
  { value: 'medium',   label: 'med' },
  { value: 'high',     label: 'high' },
  { value: 'xhigh',    label: 'xhigh' },
  { value: 'adaptive', label: 'auto' },
];

function ThinkingLevelControl({
  activeLevel,
  onChange,
}: {
  activeLevel: string;
  onChange: (level: string) => void;
}) {
  return (
    <div className="flex items-center gap-[2px] bg-muted/50 border border-border rounded-[5px] p-[2px]">
      {THINKING_LEVELS.map(({ value, label }) => {
        const isActive = activeLevel === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={`px-[6px] py-[2px] rounded-[3px] text-[9px] font-semibold tracking-wide transition-colors ${
              isActive
                ? 'bg-primary/15 text-primary border border-primary/25'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        );
      })}
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
type AgentConfig = SystemSummaryResponse['agentConfig'];

type SessionsPageProps = {
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  messages: Message[];
  runs: RunSnapshot[];
  soulMemory: SoulMemoryStateResponse | null;
  systemPrompt: string | null;
  registeredTools: RegisteredTool[];
  agentConfig?: AgentConfig;
  loading: boolean;
  error: string | null;
  onSelectSession: (id: string) => void;
  onRefresh: () => void;
  onReset: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  thinkingLevelOverride: string | null;
  onThinkingLevelChange: (level: string) => void;
};

/* ─── Session info card ──────────────────────────────────────────────────── */
function SessionInfoCard({
  session,
  agentConfig,
  thinkingLevelOverride,
  onThinkingLevelChange,
}: {
  session: SessionSummary;
  agentConfig?: AgentConfig;
  thinkingLevelOverride: string | null;
  onThinkingLevelChange: (level: string) => void;
}) {
  const cw = session.contextWindow;
  const allModels = [
    ...getCatalogModels('openai', 'apikey'),
    ...getCatalogModels('openai', 'oauth'),
    ...getCatalogModels('anthropic', 'apikey'),
  ];
  const modelMeta = allModels.find((m) => m.id === cw?.model);
  const isReasoning = modelMeta?.isReasoning ?? false;

  const thinkingLevel = agentConfig?.thinkingLevel ?? null;
  const activeLevel = thinkingLevelOverride ?? thinkingLevel ?? 'low';

  function InfoRow({ label, children }: { label: string; children: ReactNode }) {
    return (
      <div className="flex items-center justify-between py-[5px] border-b border-border last:border-0">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className="text-[10px] font-mono font-medium text-foreground">{children}</span>
      </div>
    );
  }

  function Badge({ label, active }: { label: string; active: boolean }) {
    return (
      <span className={`text-[9px] font-semibold px-[5px] py-[2px] rounded-[3px] ${
        active
          ? 'bg-primary/10 text-primary border border-primary/20'
          : 'bg-muted text-muted-foreground border border-border'
      }`}>
        {label}
      </span>
    );
  }

  return (
    <div className="border border-border rounded-lg p-3 bg-card space-y-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-foreground">Model & Agent Config</span>
        <div className="flex gap-1">
          {isReasoning && <Badge label="REASONING MODEL" active />}
        </div>
      </div>

      <InfoRow label="Provider">{cw?.provider ?? '—'}</InfoRow>
      <InfoRow label="Model">
        {cw?.model ?? '—'}
        {modelMeta?.description && (
          <span className="ml-1 text-muted-foreground/50 font-normal">· {modelMeta.description}</span>
        )}
      </InfoRow>
      <InfoRow label="Context limit">
        {cw?.limitTokens ? `${(cw.limitTokens / 1000).toFixed(0)}k tokens` : '—'}
      </InfoRow>
      <div className="flex items-center justify-between py-[5px] border-b border-border">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Thinking level</span>
        <ThinkingLevelControl activeLevel={activeLevel} onChange={onThinkingLevelChange} />
      </div>
      <InfoRow label="Reasoning model">
        <Badge label={isReasoning ? 'YES' : 'NO'} active={isReasoning} />
      </InfoRow>
      {agentConfig && (
        <>
          <InfoRow label="Max iterations">{agentConfig.maxIterations}</InfoRow>
          <InfoRow label="Max context tokens">
            {agentConfig.maxContextTokens.toLocaleString()}
          </InfoRow>
        </>
      )}
      <InfoRow label="Last run">
        {session.lastRunId ? session.lastRunId.slice(0, 8) + '…' : '—'}
      </InfoRow>
    </div>
  );
}

export function SessionsPage({
  sessions,
  selectedSessionId,
  messages,
  runs,
  soulMemory,
  systemPrompt,
  registeredTools,
  agentConfig,
  loading,
  error,
  onSelectSession,
  onRefresh,
  onReset,
  onDelete,
  thinkingLevelOverride,
  onThinkingLevelChange,
}: SessionsPageProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'prompts' | 'runs' | 'tools'>('overview');

  // Reset when session changes
  useEffect(() => {
    setActiveTab('overview');
  }, [selectedSessionId]);

  const allMessages = messages;

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

  const activeCount = sessions.filter((s) => s.status === 'active').length;
  const awaitingCount = sessions.filter(
    (s) => s.status === 'awaiting_approval' || s.status === 'awaiting_input',
  ).length;
  const session = sessions.find((s) => s.id === selectedSessionId);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── Left sidebar: compact session list ───────────────────────────── */}
      <div
        className="flex flex-col h-full shrink-0 border-r border-border"
        style={{ width: '260px' }}
      >
        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
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
            <Chip color="hsl(var(--muted-foreground))" bg="hsl(var(--muted))" border="hsl(var(--border))">
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

      {/* ── Right panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
        {!selectedSessionId ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Select a session to inspect its context
          </div>
        ) : (
          <>
            {/* Header + tabs */}
            <div className="flex-shrink-0 border-b border-border px-4 pt-4 pb-0">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h1 className="text-lg font-semibold leading-tight">
                    {session?.title || selectedSessionId.slice(0, 20)}
                  </h1>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {session?.status} · {allMessages.length} messages
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-1">
<button
                    onClick={() => onReset(selectedSessionId!)}
                    className="text-[10px] px-2 py-1 border border-destructive/40 text-destructive/70 rounded hover:bg-destructive/10 transition-colors uppercase font-bold"
                    title="Clear conversation history"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Tab bar */}
              <div className="flex gap-0">
                {([
                  ['overview', 'Overview'],
                  ['prompts', 'Prompts & Calls'],
                  ['runs', 'Runs'],
                  ['tools', 'Tools'],
                ] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === tab
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : activeTab === 'overview' ? (
              /* ── Overview ── */
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {session && (
                  <SessionInfoCard
                    session={session}
                    agentConfig={agentConfig}
                    thinkingLevelOverride={thinkingLevelOverride}
                    onThinkingLevelChange={onThinkingLevelChange}
                  />
                )}
                {session && (
                  <TokenUsageBar
                    session={session}
                    estimatedPromptTokens={estimatedPromptTokens}
                    systemPromptTokens={systemPromptTokens}
                    messages={allMessages}
                    messageCount={allMessages.length}
                    toolCallCount={allToolCalls.length}
                    runCount={runs.length}
                    registeredTools={registeredTools}
                  />
                )}
              </div>
            ) : activeTab === 'prompts' ? (
              /* ── Prompts & Calls ── */
              <div className="flex-1 grid grid-cols-[1fr_300px] gap-4 overflow-hidden min-h-0 p-4">
                <MessageThread
                  messages={allMessages}
                  systemPrompt={systemPrompt}
                  actualPromptTokens={session?.contextWindow?.promptTokens}
                />
                <div className="overflow-y-auto pr-1">
                  <ToolCallSummaryPanel toolCalls={allToolCalls} />
                </div>
              </div>
            ) : activeTab === 'runs' ? (
              /* ── Runs ── */
              <div className="flex-1 overflow-y-auto p-4">
                <RunHistoryPanel runs={runs} />
              </div>
            ) : (
              /* ── Tools ── */
              <div className="flex-1 overflow-y-auto p-4">
                <RegisteredToolsPanel tools={registeredTools} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default SessionsPage;
