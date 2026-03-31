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

  // Re-fetch whenever a delegate tool_use transitions from running → done/error.
  // This ensures newly-completed sub-agent conversations appear immediately.
  useEffect(() => {
    const delegateItems = items.filter(
      (it) => it.kind === 'tool_use' && it.tool_name === 'delegate',
    );
    const runningCount = delegateItems.filter((it) => it.kind === 'tool_use' && it.status === 'running').length;

    // A delegate just finished (running count dropped)
    if (runningCount < prevDelegateCountRef.current) {
      refetch();
    }
    prevDelegateCountRef.current = runningCount;
  }, [items, refetch]);

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

  return { sessions, liveRuns, hasActivity, refresh: refetch };
}
