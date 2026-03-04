import { useCallback, useEffect, useState } from 'react';

import { fetchAgentProgressBoard } from '@/lib/api';
import type { AgentProgressBoardResponse } from './agent-types';

const LOOKBACK_MINUTES = 180;
const PER_COLUMN = 8;
const ACTIVE_WINDOW_SECONDS = 90;
const POLL_INTERVAL_MS = 5_000;

type UseAgentProgressBoardResult = {
  board: AgentProgressBoardResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useAgentProgressBoard(enabled: boolean): UseAgentProgressBoardResult {
  const [board, setBoard] = useState<AgentProgressBoardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (background: boolean) => {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const nextBoard = await fetchAgentProgressBoard({
          lookbackMinutes: LOOKBACK_MINUTES,
          perColumn: PER_COLUMN,
          activeWindowSeconds: ACTIVE_WINDOW_SECONDS,
        });
        setBoard(nextBoard);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agent progress board');
      } finally {
        if (background) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

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

  return { board, loading, refreshing, error, refresh };
}
