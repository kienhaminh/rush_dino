import { useCallback, useEffect, useState } from 'react';
import type { AgentHealth } from '@/pages/agents/agent-types';

const HEALTH_REFRESH_MS = 10_000;

export function useAgentHealth(agentNames: string[], enabled: boolean) {
  const [healthMap, setHealthMap] = useState<Record<string, AgentHealth>>({});

  const load = useCallback(async () => {
    const results: Record<string, AgentHealth> = {};
    await Promise.allSettled(
      agentNames.map(async (name) => {
        try {
          const res = await fetch(`/api/agents/${name}/health`);
          if (res.ok) {
            results[name] = await res.json();
          }
        } catch {
          // Agent may not have health data yet — ignore
        }
      }),
    );
    setHealthMap(results);
  }, [agentNames]);

  useEffect(() => {
    if (!enabled || agentNames.length === 0) return;
    load();
    const interval = setInterval(load, HEALTH_REFRESH_MS);
    return () => clearInterval(interval);
  }, [enabled, load, agentNames]);

  const reset = useCallback(async (agentName: string) => {
    await fetch(`/api/agents/${agentName}/health/reset`, { method: 'POST' });
    await load();
  }, [load]);

  return { healthMap, reset };
}
