import { useEffect, useState } from 'react';
import type { AgentRecord } from '@/pages/agents/agent-types';
import type { KanbanBoardStats } from '@/pages/kanban/kanban-types';

export function useAgentRecords() {
  const [agentRecords, setAgentRecords] = useState<AgentRecord[]>([]);

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Failed to load agents')))
      .then((data: { items: AgentRecord[] }) => setAgentRecords(data.items ?? []))
      .catch(() => { /* silent — agents list is optional enrichment */ });
  }, []);

  return agentRecords;
}

export function useKanbanStats() {
  const [kanbanStats, setKanbanStats] = useState<KanbanBoardStats | null>(null);

  useEffect(() => {
    fetch('/api/kanban/board')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Failed to load kanban')))
      .then((data: { stats: KanbanBoardStats }) => setKanbanStats(data.stats))
      .catch(() => { /* silent — kanban stats are optional */ });
  }, []);

  return kanbanStats;
}
