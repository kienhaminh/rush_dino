import { useEffect, useMemo, useRef } from 'react';

import { useAgentSessionsQuery } from '@/lib/queries';
import type { ConversationItem } from '@/lib/types';

/**
 * Combines live WebSocket delegate tool events with persisted /api/agent-sessions
 * to produce a unified, real-time list of sub-agent runs for the side panel.
 */
export function useSubAgentSessions(items: ConversationItem[]) {
  const { data: sessions = [], refetch } = useAgentSessionsQuery();
  const prevDelegateCountRef = useRef(0);

  // Derive the running delegate count outside the effect so the effect depends
  // on the computed number rather than the raw items array. This avoids
  // re-running on every message received.
  const runningCount = useMemo(
    () =>
      items.filter(
        (it) => it.kind === 'tool_use' && it.tool_name === 'delegate' && it.status === 'running',
      ).length,
    [items],
  );

  // Re-fetch only when ALL delegates finish (running count drops to zero from
  // a positive value). This ensures newly-completed sub-agent conversations
  // appear immediately without triggering redundant fetches on 3→2 or 2→1.
  useEffect(() => {
    if (runningCount === 0 && prevDelegateCountRef.current > 0) {
      void refetch();
    }
    prevDelegateCountRef.current = runningCount;
  }, [runningCount, refetch]);

  /** Extract live (currently running) delegate calls from the conversation items. */
  const liveRuns = useMemo(() =>
    items
      .filter((it) => it.kind === 'tool_use' && it.tool_name === 'delegate')
      .map((it) => {
        if (it.kind !== 'tool_use') return null;
        const args = it.args as Record<string, string>;
        return {
          id: it.id,
          agentName: args.agent_name ?? 'Agent',
          task: args.task ?? '',
          status: it.status,
          result: it.result,
        };
      })
      .filter(Boolean) as {
      id: string;
      agentName: string;
      task: string;
      status: 'running' | 'done' | 'error';
      result?: string;
    }[],
    [items],
  );

  const hasActivity = liveRuns.length > 0 || sessions.length > 0;

  return { sessions, liveRuns, hasActivity, refresh: () => { void refetch(); } };
}
