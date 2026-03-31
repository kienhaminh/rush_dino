import { useEffect, useState } from 'react';
import type { KanbanBoardStats } from '@/pages/kanban/kanban-types';
import { useAgentsQuery } from '@/lib/queries';

export function useAgentRecords() {
  return useAgentsQuery();
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
