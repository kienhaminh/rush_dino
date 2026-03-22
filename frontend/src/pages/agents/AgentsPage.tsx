import { useCallback, useEffect, useState } from 'react';
import { AgentSidebar } from './AgentSidebar';
import type { AgentRecord, AgentRuntimeData } from './agent-types';
import { fetchAgentRuntime, fetchAgents } from '@/lib/api';
import { AgentOverviewPanel } from './agent-overview-panel';

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

// ── Main Page ────────────────────────────────────────────────────────────────

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  return (
    <div className="flex h-full w-full bg-background overflow-hidden">
      <AgentSidebar
        agents={agents}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        onRefresh={() => {
          setRuntimeByAgent({});
          void loadAgents();
        }}
        loading={loading}
      />

      <div className="flex-1 overflow-hidden">
        {error ? (
          <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {runtimeLoading ? (
          <p className="text-sm text-muted-foreground p-4">Loading agent runtime…</p>
        ) : null}

        {!selectedAgent ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-muted-foreground text-sm">Select an agent from the directory.</p>
          </div>
        ) : (
          <AgentOverviewPanel agent={selectedAgent} runtime={runtime} />
        )}
      </div>
    </div>
  );
}

export default AgentsPage;
