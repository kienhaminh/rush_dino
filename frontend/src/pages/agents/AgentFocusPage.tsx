import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { AgentPanel, AgentRecord, AgentRuntimeData } from './agent-types';
import { fetchAgents, fetchAgentRuntime } from '@/lib/api';
import { AgentOverviewPanel } from './agent-overview-panel';
import { useMessagesQuery } from '@/lib/queries';
import type { AgentMessageRecord } from '@/lib/api';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// -----------------------------------------------------------------------
// AgentMessagesPanel — inline messages list for a specific agent
// -----------------------------------------------------------------------

function AgentMessagesPanel({ agentName }: { agentName: string }) {
  const { data: messages = [], isPending: loading, error: queryError } = useMessagesQuery(true, agentName);
  const error = queryError?.message ?? null;

  if (loading && messages.length === 0) {
    return <p className="text-[10px] text-muted-foreground p-4">Loading...</p>;
  }
  if (error) {
    return <p className="text-[10px] text-destructive p-4">{error}</p>;
  }
  if (messages.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground p-4">
        No messages for this agent yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4 overflow-y-auto h-full">
      {messages.map((msg: AgentMessageRecord) => (
        <div
          key={msg.id}
          className={`rounded border border-border p-2 ${msg.read ? 'opacity-60' : ''}`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-medium">
              <span>{msg.fromAgent}</span>
              <span className="text-muted-foreground mx-1">→</span>
              <span>{msg.toAgent}</span>
            </span>
            <div className="flex items-center gap-1.5">
              {msg.state !== 'processed' && (
                <span className="text-[8px] uppercase text-muted-foreground">{msg.state}</span>
              )}
              <span className="text-[8px] text-muted-foreground">
                {formatMessageTime(msg.createdAt)}
              </span>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground">{msg.content}</p>
          {msg.failureReason && (
            <p className="mt-1 text-[8px] text-destructive">{msg.failureReason}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------
// Agent selector dropdown + tab bar
// -----------------------------------------------------------------------

interface TabBarProps {
  agents: AgentRecord[];
  activeId: string;
  runtime: AgentRuntimeData | null;
  activePanel: AgentPanel;
  onPanelChange: (panel: AgentPanel) => void;
  unreadCount: number;
}

function AgentTabBar({
  agents,
  activeId,
  runtime,
  activePanel,
  onPanelChange,
  unreadCount,
}: TabBarProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeAgent = agents.find((a) => a.id === activeId);
  const skillCount = runtime ? runtime.skills.filter((s) => s.enabled).length : 0;
  const toolCount = runtime
    ? runtime.toolSections.reduce((acc, s) => acc + s.tools.filter((t) => t.enabled).length, 0)
    : 0;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const tabs: { key: AgentPanel; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'messages', label: 'Messages' },
  ];

  return (
    <div className="flex flex-col flex-shrink-0">
      {/* Agent selector row */}
      <div className="flex items-center gap-2 px-3 h-11 border-b border-border bg-background sticky top-0 z-30">
        <div className="relative flex-1" ref={dropdownRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer max-w-[260px] border',
              open ? 'bg-primary/10 border-primary/35' : 'bg-transparent border-transparent',
            )}
          >
            <span className="text-base leading-none">{activeAgent?.emoji ?? '🤖'}</span>
            <span className="text-[12px] font-semibold text-foreground truncate">
              {activeAgent?.name ?? activeId}
            </span>
            <ChevronDownIcon
              className={cn(
                'w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-150',
                open && 'rotate-180',
              )}
            />
          </button>

          {open && (
            <div className="absolute top-full left-0 mt-1 w-[220px] max-h-80 overflow-y-auto rounded-xl bg-card border border-border shadow-xl z-50">
              {agents.map((agent) => {
                const isActive = agent.id === activeId;
                return (
                  <button
                    key={agent.id}
                    onClick={() => {
                      navigate(`/agents/${agent.id}`);
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer border-l-2',
                      isActive
                        ? 'bg-primary/12 border-primary'
                        : 'bg-transparent border-transparent hover:bg-muted',
                    )}
                  >
                    <span className="text-sm leading-none">{agent.emoji}</span>
                    <span
                      className={cn(
                        'text-[12px] font-medium truncate',
                        isActive ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {agent.name}
                    </span>
                    {isActive && (
                      <span className="ml-auto text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary flex-shrink-0">
                        ACTIVE
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {runtime && (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0 pl-2 border-l border-border hidden md:inline">
            {skillCount} skills · {toolCount} tools
          </span>
        )}
      </div>

      {/* Panel tab row */}
      <div className="flex items-center gap-1 px-3 h-9 border-b border-border bg-background">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onPanelChange(key)}
            className={cn(
              'relative flex items-center gap-1 px-3 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer',
              activePanel === key
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {label}
            {key === 'messages' && unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// AgentFocusPage — fetch state reducer
// -----------------------------------------------------------------------

type FetchState =
  | { status: 'loading'; agents: AgentRecord[]; runtime: AgentRuntimeData | null }
  | { status: 'loaded'; agents: AgentRecord[]; runtime: AgentRuntimeData }
  | { status: 'error'; agents: AgentRecord[]; runtime: AgentRuntimeData | null; error: string };

type FetchAction =
  | { type: 'start' }
  | { type: 'loaded'; agents: AgentRecord[]; runtime: AgentRuntimeData }
  | { type: 'error'; message: string };

function fetchReducer(state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case 'start': return { status: 'loading', agents: state.agents, runtime: state.runtime };
    case 'loaded': return { status: 'loaded', agents: action.agents, runtime: action.runtime };
    case 'error': return { status: 'error', agents: state.agents, runtime: state.runtime ?? null, error: action.message };
  }
}

// -----------------------------------------------------------------------
// AgentFocusPage
// -----------------------------------------------------------------------

export function AgentFocusPage() {
  const { id } = useParams<{ id: string }>();
  const agentId = id ?? '';

  const [fetchState, dispatch] = useReducer(fetchReducer, { status: 'loading', agents: [], runtime: null });
  const [activePanel, setActivePanel] = useState<AgentPanel>('overview');

  const load = useCallback(async () => {
    if (!agentId) return;
    dispatch({ type: 'start' });
    try {
      const [agentList, runtimeData] = await Promise.all([
        fetchAgents(),
        fetchAgentRuntime(agentId),
      ]);
      dispatch({ type: 'loaded', agents: agentList, runtime: runtimeData });
    } catch (err) {
      dispatch({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load agent' });
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fetch messages for the badge count — only enabled when panel is messages
  const currentAgent = fetchState.agents.find((a) => a.id === agentId);
  const agentName = currentAgent?.name ?? agentId;
  const { data: badgeMessages = [] } = useMessagesQuery(activePanel === 'messages' && !!currentAgent, agentName);
  const unreadCount = badgeMessages.filter((m) => !m.read).length;

  if (fetchState.status === 'loading' && !fetchState.runtime) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <div className="w-7 h-7 rounded-full animate-spin border-2 border-primary/20 border-t-primary/80" />
        <span className="text-[10px] tracking-[0.2em] text-muted-foreground">LOADING AGENT…</span>
      </div>
    );
  }

  if (fetchState.status === 'error' && !fetchState.runtime) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive">{fetchState.error}</p>
        <Link to="/agents" className="text-xs underline text-muted-foreground hover:text-foreground">
          Back to agents
        </Link>
      </div>
    );
  }

  const agent: AgentRecord = currentAgent ?? {
    id: agentId,
    name: agentId,
    emoji: '🤖',
    isDefault: false,
    workspace: '',
    description: '',
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <AgentTabBar
        agents={fetchState.agents}
        activeId={agentId}
        runtime={fetchState.runtime}
        activePanel={activePanel}
        onPanelChange={setActivePanel}
        unreadCount={unreadCount}
      />
      <div className="relative flex-1 overflow-hidden">
        {activePanel === 'overview' && (
          <>
            {fetchState.runtime ? (
              <AgentOverviewPanel agent={agent} runtime={fetchState.runtime} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full animate-spin border-2 border-primary/20 border-t-primary/70" />
              </div>
            )}
          </>
        )}
        {activePanel === 'messages' && <AgentMessagesPanel agentName={agent.name} />}
      </div>
    </div>
  );
}

export default AgentFocusPage;
