// AgentsPage — pure overview board. No detail panel or runtime fetching here.
// Clicking an agent card navigates to /agents/:id (handled inside AgentBoardCanvas).
import { useCallback, useEffect, useState } from 'react';
import type { AgentRecord } from './agent-types';
import { fetchAgents } from '@/lib/api';
import { AgentBoardCanvas } from './agent-board-canvas';

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextAgents = await fetchAgents();
      setAgents(nextAgents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

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

      {/* Canvas board — click navigates to /agents/:id */}
      <AgentBoardCanvas
        agents={agents}
        loading={loading}
        onRefresh={() => void loadAgents()}
      />
    </div>
  );
}

export default AgentsPage;
