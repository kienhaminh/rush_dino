import { Trash2, RefreshCw, ExternalLink, Cpu, MessageSquare, Clock, Zap } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import type { SessionSummary } from '@/lib/types';

/* ─── Keyframe animations only (no tokens, no font imports) ──────────────── */
const KEYFRAMES = `
  @keyframes sp-pulse-ring {
    0%   { transform: scale(1); opacity: 0.8; }
    100% { transform: scale(2.4); opacity: 0; }
  }
  @keyframes sp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes sp-fade-up {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes sp-shimmer {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }

  .sp-card { animation: sp-fade-up 0.3s ease both; }
  .sp-card:hover { box-shadow: 0 0 0 1px rgba(34,211,200,0.12), 0 4px 20px rgba(0,0,0,0.28); }
  .sp-card:hover .sp-accent { opacity: 1 !important; }

  .sp-dot { position: relative; display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .sp-dot-active::after, .sp-dot-awaiting::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: currentColor;
    animation: sp-pulse-ring 1.6s cubic-bezier(0,0,0.2,1) infinite;
  }
  .sp-dot-awaiting::after { animation-duration: 0.75s; }

  .sp-spin { animation: sp-spin 0.8s linear infinite; }

  .sp-ctx-bar { transition: width 0.6s cubic-bezier(0.4,0,0.2,1); }

  .sp-empty {
    background: linear-gradient(90deg, transparent 0%, rgba(34,211,200,0.03) 50%, transparent 100%);
    background-size: 200% auto;
    animation: sp-shimmer 4s linear infinite;
  }

  .sp-del-btn { transition: color 0.15s, background 0.15s, border-color 0.15s; }
  .sp-del-btn:hover { color: rgba(248,113,113,0.9) !important; background: rgba(248,113,113,0.1) !important; border-color: rgba(248,113,113,0.35) !important; }

  .sp-refresh:not(:disabled):hover { background: rgba(255,255,255,0.09) !important; border-color: rgba(255,255,255,0.18) !important; }
`;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function statusConfig(status: string) {
  switch (status) {
    case 'active':
      return { dot: 'sp-dot-active', color: '#22d3c8', label: 'ACTIVE', labelColor: 'rgba(34,211,200,0.9)', labelBg: 'rgba(34,211,200,0.08)', labelBorder: 'rgba(34,211,200,0.22)' };
    case 'awaiting_approval':
      return { dot: 'sp-dot-awaiting', color: '#f59e0b', label: 'AWAITING', labelColor: 'rgba(245,158,11,0.9)', labelBg: 'rgba(245,158,11,0.08)', labelBorder: 'rgba(245,158,11,0.22)' };
    case 'blocked':
      return { dot: '', color: '#f87171', label: 'BLOCKED', labelColor: 'rgba(248,113,113,0.9)', labelBg: 'rgba(248,113,113,0.08)', labelBorder: 'rgba(248,113,113,0.22)' };
    default:
      return { dot: '', color: 'rgba(255,255,255,0.18)', label: 'IDLE', labelColor: 'rgba(255,255,255,0.35)', labelBg: 'rgba(255,255,255,0.04)', labelBorder: 'rgba(255,255,255,0.1)' };
  }
}

function fmtTokens(v?: number | null) {
  if (v == null) return null;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function fmtCtxLabel(s: SessionSummary) {
  const cw = s.contextWindow ?? {};
  if (cw.promptTokens != null && cw.limitTokens != null) return `${fmtTokens(cw.promptTokens)} / ${fmtTokens(cw.limitTokens)}`;
  if (cw.limitTokens != null) return `${fmtTokens(cw.limitTokens)} max`;
  return '—';
}

function fmtCtxSub(s: SessionSummary) {
  const cw = s.contextWindow ?? {};
  const parts: string[] = [];
  if (cw.model) parts.push(cw.model);
  if (cw.measuredAt) parts.push(new Date(cw.measuredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  return parts.join(' · ') || 'no measurements';
}

function ctxBarGradient(ratio?: number | null) {
  if (ratio == null) return 'rgba(255,255,255,0.1)';
  if (ratio > 0.85) return 'linear-gradient(90deg,#f59e0b,#ef4444)';
  if (ratio > 0.6)  return 'linear-gradient(90deg,#22d3c8,#f59e0b)';
  return 'linear-gradient(90deg,#22d3c8,#0ea5e9)';
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ─── Small helpers ───────────────────────────────────────────────────────── */
function Chip({ children, color, bg, border }: { children: React.ReactNode; color: string; bg: string; border: string }) {
  return (
    <span
      className="text-[10px] font-semibold tracking-[0.09em] px-[7px] py-[2px] rounded-[5px]"
      style={{ color, background: bg, border: `1px solid ${border}` }}
    >
      {children}
    </span>
  );
}

function StatCell({
  label,
  icon,
  children,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex-none ${className ?? ''}`}>
      <div className="text-[9px] tracking-[0.12em] text-muted-foreground/40 mb-[7px] flex items-center gap-1">
        {icon}{label}
      </div>
      {children}
    </div>
  );
}

/* ─── Session Card ────────────────────────────────────────────────────────── */
function SessionCard({ session, index, onDelete }: { session: SessionSummary; index: number; onDelete: (id: string) => void }) {
  const sc = statusConfig(session.status);
  const ratio = session.contextWindow?.usageRatio ?? null;
  const barPct = ratio == null ? 2 : Math.max(2, Math.min(100, ratio * 100));

  return (
    <div
      className="sp-card bg-white/[0.025] border border-white/[0.07] rounded-[14px] overflow-hidden relative transition-[box-shadow,border-color] duration-200"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      {/* Left status accent stripe */}
      <div
        className="sp-accent absolute left-0 top-0 bottom-0 w-[3px] transition-opacity duration-200"
        style={{ background: sc.color, opacity: 0.7 }}
      />

      <div className="px-[18px] py-[14px] pl-[22px]">
        {/* Row 1: title + badges + actions */}
        <div className="flex flex-wrap items-center justify-between gap-[10px]">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className={`sp-dot ${sc.dot}`} style={{ color: sc.color, background: sc.color }} />
            <span className="text-[13px] font-semibold text-foreground tracking-[-0.01em]">
              {session.title}
            </span>
            <Chip color={sc.labelColor} bg={sc.labelBg} border={sc.labelBorder}>{sc.label}</Chip>
            {session.pendingApprovalCount > 0 && (
              <Chip color="rgba(245,158,11,0.9)" bg="rgba(245,158,11,0.1)" border="rgba(245,158,11,0.22)">
                {session.pendingApprovalCount} PENDING
              </Chip>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {session.lastRunId && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] tracking-[0.07em] text-primary/85 border border-primary/20 bg-primary/5 rounded-[8px] px-[10px] gap-[5px]"
              >
                <RouterLink to="/runs">
                  <ExternalLink size={10} />
                  OPEN RUN
                </RouterLink>
              </Button>
            )}
            <button
              className="sp-del-btn w-7 h-7 rounded-[8px] border border-red-400/15 bg-red-400/[0.04] text-red-400/45 flex items-center justify-center cursor-pointer shrink-0"
              onClick={() => onDelete(session.id)}
              title="Delete session"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {/* Session ID */}
        <div className="mt-[5px] text-[10px] text-muted-foreground/40 tracking-[0.03em]">
          {session.id}
        </div>

        {/* Stats row */}
        <div className="mt-[14px] pt-3 border-t border-white/[0.05] flex flex-wrap items-stretch gap-0">
          {/* Context */}
          <StatCell label="CONTEXT" icon={<Cpu size={9} />} className="min-w-[150px] flex-[1_1_150px] pr-5">
            <div className="text-[13px] font-semibold text-foreground/85 mb-2">{fmtCtxLabel(session)}</div>
            <div className="h-[3px] rounded-sm bg-white/[0.06] overflow-hidden mb-[5px]">
              <div
                className="sp-ctx-bar h-full rounded-sm"
                style={{ width: `${barPct}%`, background: ctxBarGradient(ratio) }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground/50">{fmtCtxSub(session)}</div>
          </StatCell>

          <div className="w-px bg-white/[0.06] mx-5 shrink-0" />

          {/* Runs */}
          <StatCell label="RUNS" icon={<Zap size={9} />} className="pr-5">
            <div className="text-[13px] font-medium text-foreground/75">
              {session.activeRunCount} <span className="text-muted-foreground/[0.45] font-normal">active</span>
            </div>
            <div className="text-[11px] text-muted-foreground/[0.42] mt-[3px]">{session.queuedRunCount} queued</div>
          </StatCell>

          <div className="w-px bg-white/[0.06] mx-5 shrink-0" />

          {/* Messages */}
          <StatCell label="MESSAGES" icon={<MessageSquare size={9} />} className="pr-5">
            <div className="text-[13px] font-semibold text-foreground/85">{session.messageCount}</div>
          </StatCell>

          <div className="w-px bg-white/[0.06] mx-5 shrink-0" />

          {/* Updated */}
          <StatCell label="UPDATED" icon={<Clock size={9} />}>
            <div className="text-[13px] font-medium text-foreground/75">{timeAgo(session.updatedAt)}</div>
            <div className="text-[10px] text-muted-foreground/50 mt-[3px]">
              {new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </StatCell>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */
type SessionsPageProps = {
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onDelete: (sessionId: string) => void;
};

export function SessionsPage({ sessions, loading, error, onRefresh, onDelete }: SessionsPageProps) {
  const activeCount   = sessions.filter((s) => s.status === 'active').length;
  const awaitingCount = sessions.filter((s) => s.status === 'awaiting_approval').length;

  return (
    <>
      {/* Minimal keyframe animations — no tokens, no font imports */}
      <style>{KEYFRAMES}</style>

      <div className="flex-1 min-w-0 h-full overflow-y-auto p-7 flex flex-col gap-[18px]">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 px-[22px] py-[18px] bg-white/[0.025] border border-white/[0.07] rounded-[14px]">
          <div>
            <div className="flex items-center gap-[10px] mb-[10px]">
              <h1 className="text-[17px] font-bold text-foreground tracking-[-0.02em] m-0">
                Conversation sessions
              </h1>
              <div className="flex gap-[6px]">
                <Chip color="rgba(255,255,255,0.4)" bg="rgba(255,255,255,0.06)" border="rgba(255,255,255,0.08)">
                  {sessions.length} TOTAL
                </Chip>
                {activeCount > 0 && (
                  <Chip color="rgba(34,211,200,0.9)" bg="rgba(34,211,200,0.08)" border="rgba(34,211,200,0.22)">
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
            <p className="text-[12px] text-muted-foreground/[0.42] leading-relaxed m-0 max-w-[500px]">
              Active assistant workspaces — manage approvals, review activity, and clean up without the CLI.
            </p>
          </div>

          <button
            className="sp-refresh flex items-center gap-[7px] h-8 px-[14px] text-[11px] font-semibold tracking-[0.08em] bg-white/[0.05] border border-white/[0.09] rounded-[9px] transition-[background,border-color] duration-150 disabled:cursor-not-allowed"
            style={{ color: loading ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.65)' }}
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw size={11} className={loading ? 'sp-spin' : ''} />
            REFRESH
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-[11px] rounded-[10px] bg-red-400/[0.06] border border-red-400/[0.18] text-[12px] text-red-400/85 tracking-[0.02em]">
            {error}
          </div>
        )}

        {/* List */}
        <div className="flex flex-col gap-[10px]">
          {sessions.length > 0 ? (
            sessions.map((s, i) => <SessionCard key={s.id} session={s} index={i} onDelete={onDelete} />)
          ) : (
            <div className="sp-empty px-6 py-[52px] rounded-[14px] border border-dashed border-white/[0.07] text-center">
              <div className="text-[26px] mb-3 opacity-[0.12]">◈</div>
              <div className="text-[11px] text-muted-foreground/40 tracking-[0.1em]">NO SESSIONS FOUND</div>
              <div className="text-[11px] text-muted-foreground/[0.25] mt-[5px]">Sessions will appear here once created</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default SessionsPage;
