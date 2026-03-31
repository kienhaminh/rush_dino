/**
 * useWorkflowPageState — manages all data fetching, state, and handlers for WorkflowsPage.
 * Read-only: workflows are created/modified by agents via CLI. Users can browse, run, and cancel.
 *
 * Data fetching is delegated to React Query hooks; only UI selection state lives in useState.
 * Active-run polling (2s) is handled by useWorkflowRunsQuery and useWorkflowRunQuery via
 * self-adjusting refetchInterval — no setInterval/useEffect polling needed here.
 */
import { useState, useCallback } from 'react';
import {
  useWorkflowsQuery,
  useWorkflowQuery,
  useWorkflowRunsQuery,
  useWorkflowRunQuery,
  useStartWorkflowRunMutation,
  useCancelWorkflowRunMutation,
} from '../../lib/queries';
import { useAgentsQuery } from '../../lib/queries';

export function useWorkflowPageState() {
  // UI selection state only — server data is owned by React Query
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Server state via React Query
  const workflowsQuery = useWorkflowsQuery();
  const agentsQuery = useAgentsQuery();
  const workflowQuery = useWorkflowQuery(selectedWorkflowId ?? '');
  const runsQuery = useWorkflowRunsQuery(selectedWorkflowId ?? '');
  const runQuery = useWorkflowRunQuery(selectedRunId ?? '');

  const startMutation = useStartWorkflowRunMutation();
  const cancelMutation = useCancelWorkflowRunMutation();

  const handleSelectWorkflow = useCallback((id: string) => {
    setSelectedWorkflowId(id);
    setSelectedRunId(null);
  }, []);

  // handleRun matches the original signature: no args, uses current workflow
  const handleRun = useCallback(async () => {
    if (!selectedWorkflowId) return;
    const result = await startMutation.mutateAsync({
      workflowId: selectedWorkflowId,
      payload: { triggeredBy: 'user' },
    });
    // WorkflowRunStartResponse always carries runId
    setSelectedRunId(result.runId);
  }, [selectedWorkflowId, startMutation]);

  const handleCancel = useCallback(async (runId: string) => {
    await cancelMutation.mutateAsync(runId);
  }, [cancelMutation]);

  return {
    // Data
    workflowSummaries: workflowsQuery.data ?? [],
    agents: agentsQuery.data ?? [],
    selectedWorkflowId,
    setSelectedWorkflowId: handleSelectWorkflow,
    workflow: workflowQuery.data ?? null,
    runs: runsQuery.data ?? [],
    selectedRunId,
    setSelectedRunId,
    selectedRun: runQuery.data ?? null,

    // Loading flags — mapped from React Query states
    loadingWorkflows: workflowsQuery.isPending,
    loadingDetail: workflowQuery.isFetching,
    loadingRuns: runsQuery.isFetching,
    loadingRunDetail: runQuery.isFetching,

    // Mutation states
    running: startMutation.isPending,
    cancelling: cancelMutation.isPending ? cancelMutation.variables ?? null : null,

    // Error — surface workflow list error first, then selected workflow error
    error: workflowsQuery.error?.message ?? workflowQuery.error?.message ?? null,

    // Handlers
    handleRun,
    handleCancel,
  };
}
