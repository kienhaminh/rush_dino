import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { AgentRecord, AgentRuntimeData } from './agent-types';
import { fetchAgents, fetchAgentRuntime } from '@/lib/api';
import { AgentOverviewPanel } from './agent-overview-panel';

interface TabBarProps {
  agents: AgentRecord[];
  activeId: string;
  runtime: AgentRuntimeData | null;
}

function AgentTabBar({ agents, activeId, runtime }: TabBarProps) {
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

  return (
    <div className="flex items-center gap-2 px-3 h-11 border-b border-border bg-background sticky top-0 z-30 flex-shrink-0">
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
            className={cn('w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-150', open && 'rotate-180')}
          />
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 w-[220px] max-h-80 overflow-y-auto rounded-xl bg-card border border-border shadow-xl z-50">
            {agents.map((agent) => {
              const isActive = agent.id === activeId;
              return (
                <button
                  key={agent.id}
                  onClick={() => { navigate(`/agents/${agent.id}`); setOpen(false); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer border-l-2',
                    isActive
                      ? 'bg-primary/12 border-primary'
                      : 'bg-transparent border-transparent hover:bg-muted',
                  )}
                >
                  <span className="text-sm leading-none">{agent.emoji}</span>
                  <span className={cn('text-[12px] font-medium truncate', isActive ? 'text-primary' : 'text-foreground')}>
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
  );
}

export function AgentFocusPage() {
  const { id } = useParams<{ id: string }>();
  const agentId = id ?? '';

  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [runtime, setRuntime] = useState<AgentRuntimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      const [agentList, runtimeData] = await Promise.all([
        fetchAgents(),
        fetchAgentRuntime(agentId),
      ]);
      setAgents(agentList);
      setRuntime(runtimeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { void load(); }, [load]);

  const currentAgent = agents.find((a) => a.id === agentId);

  if (loading && !runtime) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <div className="w-7 h-7 rounded-full animate-spin border-2 border-primary/20 border-t-primary/80" />
        <span className="text-[10px] tracking-[0.2em] text-muted-foreground">LOADING AGENT…</span>
      </div>
    );
  }

  if (error && !runtime) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive">{error}</p>
        <Link to="/agents" className="text-xs underline text-muted-foreground hover:text-foreground">
          Back to agents
        </Link>
      </div>
    );
  }

  const agent: AgentRecord = currentAgent ?? {
    id: agentId, name: agentId, emoji: '🤖',
    isDefault: false, workspace: '', description: '',
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <AgentTabBar agents={agents} activeId={agentId} runtime={runtime} />
      <div className="relative flex-1 overflow-hidden">
        {runtime ? (
          <AgentOverviewPanel agent={agent} runtime={runtime} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full animate-spin border-2 border-primary/20 border-t-primary/70" />
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentFocusPage;
