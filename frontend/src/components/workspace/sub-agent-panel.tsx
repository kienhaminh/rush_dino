import { useState } from 'react';
import { Bot, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, MessageSquare, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchConversation, deleteConversation } from '@/lib/api';
import { agentColor } from './agent-colors';
import { sessionLabel } from '@/lib/session-id-utils';
import { SubAgentMarkdown } from './sub-agent-markdown';
import type { SessionSummary } from '@/lib/types';
import type { ConversationItem } from '@/lib/types';

interface LiveRun {
  id: string;
  agentName: string;
  task: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

interface SubAgentPanelProps {
  sessions: SessionSummary[];
  liveRuns: LiveRun[];
  width?: number;
}

// ── Session detail modal (simple inline expand) ───────────────────────────────
function SessionDetail({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [items, setItems] = useState<ConversationItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useState(() => {
    fetchConversation(sessionId)
      .then((d) => {
        // map messages to simple display items
        const mapped: ConversationItem[] = d.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            kind: m.role === 'user' ? 'user' : 'assistant',
            id: m.id,
            content: m.content,
            richContent: null,
            runId: null,
          })) as ConversationItem[];
        setItems(mapped);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  });

  return (
    <div className="border-t border-border/20 bg-background/60 max-h-64 overflow-y-auto scrollbar-thin">
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={14} className="animate-spin text-muted-foreground/40" />
        </div>
      ) : !items?.length ? (
        <p className="text-[11px] text-muted-foreground/40 px-3 py-3">No messages yet.</p>
      ) : (
        <div className="px-3 py-2 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'text-[11px] rounded-lg px-2.5 py-1.5 leading-relaxed',
                item.kind === 'user'
                  ? 'bg-primary/10 text-primary/80 ml-4'
                  : 'bg-muted/40 text-foreground/70 mr-4',
              )}
            >
              {item.kind !== 'tool_use' && item.kind !== 'thinking' && item.kind !== 'error' && item.kind !== 'approval' && item.kind !== 'input_request'
                ? <SubAgentMarkdown content={item.content} />
                : null}
            </div>
          ))}
        </div>
      )}
      <button
        onClick={onClose}
        className="w-full text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 py-1.5 transition-colors"
      >
        collapse
      </button>
    </div>
  );
}

// ── Live run row (from WS events, not yet persisted) ─────────────────────────
function LiveRunRow({ run }: { run: LiveRun }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/20 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
      >
        {/* Agent badge */}
        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0', agentColor(run.agentName))}>
          {run.agentName}
        </span>
        {/* Task */}
        <span className="text-[11px] text-foreground/60 truncate flex-1">{run.task}</span>
        {/* Status */}
        <span className="shrink-0">
          {run.status === 'running' && <Loader2 size={11} className="text-amber-400 animate-spin" />}
          {run.status === 'done' && <CheckCircle2 size={11} className="text-emerald-400" />}
          {run.status === 'error' && <XCircle size={11} className="text-red-400" />}
        </span>
        {expanded ? <ChevronDown size={10} className="text-muted-foreground/40 shrink-0" /> : <ChevronUp size={10} className="text-muted-foreground/40 shrink-0" />}
      </button>
      {expanded && run.result && (
        <div className="border-t border-border/20 px-3 py-2 max-h-40 overflow-y-auto scrollbar-thin">
          <div className="text-[11px] text-muted-foreground/70">
            <SubAgentMarkdown content={run.result} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Persisted session row ─────────────────────────────────────────────────────
function SessionRow({ session, onDelete }: { session: SessionSummary; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  // Agent name comes from the session ID (e.g. "code-reviewer" → "Code Reviewer").
  // Task description is still parsed from the title.
  const agentName = sessionLabel(session.id);
  const colonIdx = session.title.indexOf(':');
  const task = colonIdx > 0 ? session.title.slice(colonIdx + 1).trim() : '';
  const isActive = session.activeRunCount > 0;

  return (
    <div className="border border-border/20 rounded-xl overflow-hidden group">
      <div className="flex items-center">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left min-w-0"
        >
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0', agentColor(agentName))}>
            {agentName}
          </span>
          <span className="text-[11px] text-foreground/60 truncate flex-1">{task || session.title}</span>
          {isActive
            ? <Loader2 size={11} className="text-amber-400 animate-spin shrink-0" />
            : <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />}
          {expanded
            ? <ChevronDown size={10} className="text-muted-foreground/40 shrink-0" />
            : <ChevronUp size={10} className="text-muted-foreground/40 shrink-0" />}
        </button>
        {!isActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
            className="opacity-0 group-hover:opacity-100 px-2 py-2 text-muted-foreground/30 hover:text-red-400 transition-all shrink-0"
            title="Delete agent session"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
      {expanded && (
        <SessionDetail sessionId={session.id} onClose={() => setExpanded(false)} />
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function SubAgentPanel({ sessions, liveRuns, width, onSessionDeleted }: SubAgentPanelProps & { onSessionDeleted?: () => void }) {
  const [collapsed, setCollapsed] = useState(false);

  const handleDelete = async (id: string) => {
    await deleteConversation(id);
    onSessionDeleted?.();
  };

  const hasRunning = liveRuns.some((r) => r.status === 'running');
  const totalCount = liveRuns.length + sessions.length;

  return (
    <div className="shrink-0 flex flex-col h-full bg-background/40" style={{ width: width ?? 260 }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 px-3 py-3 border-b border-border/20 hover:bg-muted/10 transition-colors w-full text-left"
      >
        <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Bot size={11} className="text-primary/70" />
        </div>
        <span className="text-[11px] font-semibold text-foreground/60 uppercase tracking-widest flex-1">
          Agent Sessions
        </span>
        {hasRunning && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
        )}
        {!hasRunning && totalCount > 0 && (
          <span className="text-[10px] text-muted-foreground/40 shrink-0">{totalCount}</span>
        )}
        {collapsed
          ? <ChevronDown size={12} className="text-muted-foreground/40 shrink-0" />
          : <ChevronUp size={12} className="text-muted-foreground/40 shrink-0" />}
      </button>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-2">
          {/* Live (WS-derived) runs first */}
          {liveRuns.map((run) => (
            <LiveRunRow key={run.id} run={run} />
          ))}

          {/* Persisted sessions */}
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} onDelete={handleDelete} />
          ))}

          {totalCount === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <MessageSquare size={18} className="text-muted-foreground/20" />
              <p className="text-[11px] text-muted-foreground/30">No sub-agent sessions yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
