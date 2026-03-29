import { useCallback, useEffect, useState } from 'react';

import type { KanbanBoardResponse } from './kanban-types';

const POLL_INTERVAL_MS = 3_000;

type UseKanbanBoardResult = {
  board: KanbanBoardResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
};

async function fetchKanbanBoard(): Promise<KanbanBoardResponse> {
  const response = await fetch('/api/kanban/board');
  if (!response.ok) {
    throw new Error(`Failed to load kanban board: ${response.status}`);
  }
  return response.json();
}

export function useKanbanBoard(enabled: boolean): UseKanbanBoardResult {
  const [board, setBoard] = useState<KanbanBoardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (background: boolean) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await fetchKanbanBoard();
      setBoard(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load kanban board');
    } finally {
      if (background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  const deleteTask = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/kanban/tasks/${taskId}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(`Failed to delete task: ${res.status}`);
    }
    await load(true);
  }, [load]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await load(false);
    };
    void run();

    const timer = window.setInterval(() => {
      if (!cancelled) {
        void load(true);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, load]);

  return { board, loading, refreshing, error, refresh, deleteTask };
}
