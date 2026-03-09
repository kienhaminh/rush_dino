import { startTransition, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { abortRun, fetchRun, fetchRuns } from '@/lib/api';
import type { RunDetail, RunKind, RunSnapshot, RunState } from '@/lib/types';

import { RunsPage } from './RunsPage';

export function RunsRoute() {
  const [runs, setRuns] = useState<RunSnapshot[]>([]);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<RunKind | 'all'>('all');
  const [stateFilter, setStateFilter] = useState<RunState | 'all'>('all');

  const loadRuns = async (preserveSelection = true) => {
    setLoading(true);
    try {
      const next = await fetchRuns({
        kind: kindFilter === 'all' ? undefined : kindFilter,
        state: stateFilter === 'all' ? undefined : stateFilter,
        limit: 100,
      });
      setRuns(next);
      setError(null);

      const nextSelected =
        preserveSelection && selectedRunId && next.some((run) => run.id === selectedRunId)
          ? selectedRunId
          : next[0]?.id ?? null;
      setSelectedRunId(nextSelected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRuns(false);
  }, [kindFilter, stateFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedRunId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    fetchRun(selectedRunId)
      .then((next) => {
        if (!cancelled) {
          setDetail(next);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load run detail.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadRuns(true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [kindFilter, stateFilter, selectedRunId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAbort = async (runId: string) => {
    try {
      await abortRun(runId);
      toast.success('Abort signal sent to the run.');
      await loadRuns(true);
      if (selectedRunId === runId) {
        const nextDetail = await fetchRun(runId);
        setDetail(nextDetail);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to abort run.');
    }
  };

  return (
    <RunsPage
      runs={runs}
      detail={detail}
      loading={loading}
      detailLoading={detailLoading}
      error={error}
      selectedRunId={selectedRunId}
      kindFilter={kindFilter}
      stateFilter={stateFilter}
      onSelectRun={(runId) => {
        startTransition(() => setSelectedRunId(runId));
      }}
      onRefresh={() => {
        void loadRuns(true);
      }}
      onAbort={(runId) => {
        void handleAbort(runId);
      }}
      onKindFilterChange={(next) => {
        startTransition(() => setKindFilter(next));
      }}
      onStateFilterChange={(next) => {
        startTransition(() => setStateFilter(next));
      }}
    />
  );
}
