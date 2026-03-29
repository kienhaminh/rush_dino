import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchAgentSessions } from '@/lib/api';
import type { ConversationItem, SessionSummary } from '@/lib/types';

/**
 * Combines live WebSocket delegate tool events with persisted /api/agent-sessions
 * to produce a unified, real-time list of sub-agent runs for the side panel.
 */
export function useSubAgentSessions(items: ConversationItem[]) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const prevDelegateCountRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchAgentSessions();
      setSessions(data);
    } catch {
      // silently ignore — panel is non-critical
    }
  }, []);

  // Load on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-fetch whenever a delegate tool_use transitions from running → done/error.
  // This ensures newly-completed sub-agent conversations appear immediately.
  useEffect(() => {
    const delegateItems = items.filter(
      (it) => it.kind === 'tool_use' && it.tool_name === 'delegate',
    );
    const runningCount = delegateItems.filter((it) => it.kind === 'tool_use' && it.status === 'running').length;

    // A delegate just finished (running count dropped)
    if (runningCount < prevDelegateCountRef.current) {
      refresh();
    }
    prevDelegateCountRef.current = runningCount;
  }, [items, refresh]);

  /** Extract live (currently running) delegate calls from the conversation items. */
  const liveRuns = items
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
  }[];

  const hasActivity = liveRuns.length > 0 || sessions.length > 0;

  return { sessions, liveRuns, hasActivity, refresh };
}
