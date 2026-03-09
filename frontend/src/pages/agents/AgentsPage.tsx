import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AgentSidebar } from './AgentSidebar';
import { AgentOverview } from './AgentOverview';
import { AgentFilesPanel } from './AgentFilesPanel';
import { AgentToolsPanel } from './AgentToolsPanel';
import { AgentSkillsPanel } from './AgentSkillsPanel';
import { AgentChannelsPanel } from './AgentChannelsPanel';
import { AgentCronPanel } from './AgentCronPanel';
import { AgentProgressBoardPanel } from './AgentProgressBoardPanel';
import { AGENT_PANELS } from './agent-mock-data';
import type { AgentPanel, AgentRecord, AgentRuntimeData } from './agent-types';
import { deleteAgent, fetchAgentRuntime, fetchAgents } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useAgentProgressBoard } from './use-agent-progress-board';

const PANELS: AgentPanel[] = [...AGENT_PANELS];

const EMPTY_RUNTIME: AgentRuntimeData = {
  files: [],
  toolsProfile: 'runtime',
  toolSections: [],
  skills: [],
  channels: [],
  cronStatus: { enabled: false, jobs: 0, nextWake: 'n/a' },
  cronJobs: [],
  soul: {
    persona: '',
    tone: '',
    coreValues: [],
    traits: [],
    systemPrompt: '',
  },
  memory: [],
};

const PANEL_LABELS: Record<AgentPanel, string> = {
  overview: 'Overview',
  progress: 'Progress',
  files: 'Files',
  tools: 'Tools',
  skills: 'Skills',
  channels: 'Channels',
  cron: 'Cron',
};

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<AgentPanel>('overview');
  const [runtimeByAgent, setRuntimeByAgent] = useState<Record<string, AgentRuntimeData>>({});
  const [loading, setLoading] = useState(false);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextAgents = await fetchAgents();
      setAgents(nextAgents);
      setSelectedId((current) => {
        if (current && nextAgents.some((agent) => agent.id === current)) {
          return current;
        }
        return nextAgents[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    if (!selectedId) return;
    if (runtimeByAgent[selectedId]) return;

    let cancelled = false;
    const loadRuntime = async () => {
      setRuntimeLoading(true);
      try {
        const runtime = await fetchAgentRuntime(selectedId);
        if (!cancelled) {
          setRuntimeByAgent((prev) => ({ ...prev, [selectedId]: runtime }));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : `Failed to load runtime for ${selectedId}`);
        }
      } finally {
        if (!cancelled) setRuntimeLoading(false);
      }
    };

    void loadRuntime();
    return () => {
      cancelled = true;
    };
  }, [selectedId, runtimeByAgent]);

  const selectedAgent = agents.find((agent) => agent.id === selectedId) ?? null;
  const runtime = (selectedId && runtimeByAgent[selectedId]) || EMPTY_RUNTIME;
  const {
    board: progressBoard,
    loading: progressLoading,
    refreshing: progressRefreshing,
    error: progressError,
    refresh: refreshProgressBoard,
  } = useAgentProgressBoard(activePanel === 'progress');

  const handleDeleteAgent = useCallback(async () => {
    if (!selectedAgent || selectedAgent.isDefault) return;
    if (!window.confirm(`Delete agent "${selectedAgent.name}" and its workspace files?`)) {
      return;
    }

    try {
      await deleteAgent(selectedAgent.id);
      toast.success('Agent deleted.');
      setRuntimeByAgent((prev) => {
        const next = { ...prev };
        delete next[selectedAgent.id];
        return next;
      });
      await loadAgents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete agent.');
    }
  }, [loadAgents, selectedAgent]);

  return (
    <div className="flex h-full w-full bg-background overflow-hidden">
      {/* Agent Directory Sidebar */}
      <AgentSidebar
        agents={agents}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setActivePanel('overview');
        }}
        onRefresh={() => {
          setRuntimeByAgent({});
          void loadAgents();
        }}
        loading={loading}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Agent Identity Header Bar */}
        {selectedAgent ? (
          <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-border bg-card/50 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-xl shadow-sm border border-border/50 flex-shrink-0">
                {selectedAgent.emoji || '🤖'}
              </div>
              <div>
                <div className="font-semibold text-sm flex items-center gap-2">
                  {selectedAgent.name}
                  {selectedAgent.isDefault && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                      Default
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground font-mono">{selectedAgent.id}</div>
              </div>
            </div>
            <button
              onClick={() => {
                setRuntimeByAgent({});
                void loadAgents();
              }}
              disabled={loading}
              className="flex items-center gap-2 text-xs font-medium bg-background border border-border hover:bg-secondary transition-colors h-8 px-3 rounded disabled:opacity-50"
            >
              <RefreshCwIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            {!selectedAgent.isDefault ? (
              <button
                onClick={() => {
                  void handleDeleteAgent();
                }}
                className="flex items-center gap-2 text-xs font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors h-8 px-3 rounded"
              >
                <Trash2Icon className="w-3.5 h-3.5" />
                Delete
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Panel Navigation Tabs */}
        <div className="flex items-center overflow-x-auto border-b border-border bg-card/30 px-6 flex-shrink-0">
          {PANELS.map((panel) => (
            <button
              key={panel}
              onClick={() => setActivePanel(panel)}
              className={`relative py-3 px-1 mr-6 text-sm font-medium transition-colors whitespace-nowrap
                ${
                  activePanel === panel
                    ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary after:rounded-t'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {PANEL_LABELS[panel]}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive mb-6">
              {error}
            </div>
          ) : null}
          {runtimeLoading ? (
            <p className="text-sm text-muted-foreground mb-4">Loading agent runtime…</p>
          ) : null}

          {activePanel === 'progress' ? (
            <AgentProgressBoardPanel
              board={progressBoard}
              loading={progressLoading}
              refreshing={progressRefreshing}
              error={progressError}
              onRefresh={() => {
                void refreshProgressBoard();
              }}
            />
          ) : !selectedAgent ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <p className="text-muted-foreground text-sm">Select an agent from the directory.</p>
            </div>
          ) : (
            <>
              {activePanel === 'overview' && <AgentOverview agent={selectedAgent} />}
              {activePanel === 'files' && (
                <AgentFilesPanel agentId={selectedAgent.id} runtime={runtime} />
              )}
              {activePanel === 'tools' && <AgentToolsPanel runtime={runtime} />}
              {activePanel === 'skills' && <AgentSkillsPanel runtime={runtime} />}
              {activePanel === 'channels' && <AgentChannelsPanel runtime={runtime} />}
              {activePanel === 'cron' && <AgentCronPanel runtime={runtime} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgentsPage;
