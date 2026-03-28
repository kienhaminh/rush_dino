import { useCallback, useEffect, useState } from 'react';
import type { AgentPanel, AgentRecord, AgentRuntimeData } from './agent-types';
import { fetchAgentRuntime, fetchAgents } from '@/lib/api';
import { useAgentProgressBoard } from './use-agent-progress-board';
import { AgentBoardCanvas } from './agent-board-canvas';
import { AgentDetailPanel } from './agent-detail-panel';

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

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runtimeByAgent, setRuntimeByAgent] = useState<Record<string, AgentRuntimeData>>({});
  const [loading, setLoading] = useState(false);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailPanelTab, setDetailPanelTab] = useState<AgentPanel>('overview');

  const {
    board: progressBoard,
    loading: progressLoading,
    refreshing: progressRefreshing,
    error: progressError,
    refresh: refreshProgressBoard,
  } = useAgentProgressBoard(selectedId !== null && detailPanelTab === 'progress');

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
        return null;
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

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* Error toast */}
      {error && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 rounded-lg px-4 py-2 text-xs"
          style={{
            background: 'rgba(220,38,38,0.15)',
            border: '1px solid rgba(220,38,38,0.35)',
            color: 'rgba(252,165,165,0.9)',
          }}
        >
          {error}
        </div>
      )}

      {/* Canvas board */}
      <AgentBoardCanvas
        agents={agents}
        selectedId={selectedId}
        runtimeByAgent={runtimeByAgent}
        loading={loading}
        onAgentSelect={(id) => {
          setSelectedId(id);
          if (id !== selectedId) setDetailPanelTab('overview');
        }}
        onRefresh={() => {
          setRuntimeByAgent({});
          void loadAgents();
        }}
      />

      {/* Slide-in detail panel */}
      <AgentDetailPanel
        agent={selectedAgent}
        runtime={runtime}
        runtimeLoading={runtimeLoading}
        progressBoard={progressBoard}
        progressLoading={progressLoading}
        progressRefreshing={progressRefreshing}
        progressError={progressError}
        onProgressRefresh={() => {
          void refreshProgressBoard();
        }}
        activeTab={detailPanelTab}
        onTabChange={setDetailPanelTab}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

export default AgentsPage;
