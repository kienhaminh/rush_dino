/**
 * useWorkflowPageState — manages all data fetching, state, and handlers for WorkflowsPage.
 * Read-only: workflows are created/modified by agents via CLI. Users can browse, run, and cancel.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelWorkflowRun,
  fetchAgents,
  fetchWorkflow,
  fetchWorkflowRun,
  fetchWorkflowRuns,
  fetchWorkflows,
  startWorkflowRun,
} from '@/lib/api';
import type { AgentRecord } from '@/pages/agents/agent-types';
import type { WorkflowDetail, WorkflowListItem, WorkflowRunDetail, WorkflowRunListItem } from './workflow-types';

export function useWorkflowPageState() {
  const [workflowSummaries, setWorkflowSummaries] = useState<WorkflowListItem[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [runs, setRuns] = useState<WorkflowRunListItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<WorkflowRunDetail | null>(null);

  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingRunDetail, setLoadingRunDetail] = useState(false);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflowSummaries = useCallback(async () => {
    setLoadingWorkflows(true);
    try {
      const [nextWorkflows, nextAgents] = await Promise.all([fetchWorkflows(), fetchAgents()]);
      setWorkflowSummaries(nextWorkflows);
      setAgents(nextAgents);
      setSelectedWorkflowId((current) => {
        if (current && nextWorkflows.some((w) => w.id === current)) return current;
        return nextWorkflows[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      setLoadingWorkflows(false);
    }
  }, []);

  useEffect(() => { void loadWorkflowSummaries(); }, [loadWorkflowSummaries]);

  const loadSelectedWorkflow = useCallback(async (workflowId: string) => {
    setLoadingDetail(true);
    setLoadingRuns(true);
    try {
      const [detail, runItems] = await Promise.all([fetchWorkflow(workflowId), fetchWorkflowRuns(workflowId)]);
      setWorkflow(detail);
      setRuns(runItems);
      setSelectedRunId((current) => {
        if (current && runItems.some((r) => r.id === current)) return current;
        return runItems[0]?.id ?? null;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow');
    } finally {
      setLoadingDetail(false);
      setLoadingRuns(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedWorkflowId) return;
    void loadSelectedWorkflow(selectedWorkflowId);
  }, [selectedWorkflowId, loadSelectedWorkflow]);

  // Load run detail when selection changes
  useEffect(() => {
    if (!selectedRunId) { setSelectedRun(null); return; }
    let cancelled = false;
    const load = async () => {
      setLoadingRunDetail(true);
      try {
        const detail = await fetchWorkflowRun(selectedRunId);
        if (!cancelled) setSelectedRun(detail);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load run');
      } finally {
        if (!cancelled) setLoadingRunDetail(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [selectedRunId]);

  // Poll active runs every 2 seconds
  const hasActiveRun = useMemo(
    () => runs.some((r) => r.status === 'queued' || r.status === 'running'),
    [runs],
  );
  useEffect(() => {
    if (!selectedWorkflowId || !hasActiveRun) return;
    const interval = setInterval(() => {
      void (async () => {
        try {
          const runItems = await fetchWorkflowRuns(selectedWorkflowId);
          setRuns(runItems);
          if (selectedRunId) setSelectedRun(await fetchWorkflowRun(selectedRunId));
        } catch { /* silent refresh */ }
      })();
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedWorkflowId, hasActiveRun, selectedRunId]);

  const handleRun = async () => {
    if (!workflow) return;
    setRunning(true);
    try {
      const started = await startWorkflowRun(workflow.id, { triggeredBy: 'user' });
      setSelectedRunId(started.runId);
      const [runItems, runDetail] = await Promise.all([fetchWorkflowRuns(workflow.id), fetchWorkflowRun(started.runId)]);
      setRuns(runItems);
      setSelectedRun(runDetail);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
      setRunning(false);
    }
  };

  const handleCancel = async (runId: string) => {
    setCancelling(runId);
    try {
      await cancelWorkflowRun(runId);
      if (selectedWorkflowId) {
        const runItems = await fetchWorkflowRuns(selectedWorkflowId);
        setRuns(runItems);
        if (selectedRunId) setSelectedRun(await fetchWorkflowRun(selectedRunId));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel run');
    } finally {
      setCancelling(null);
    }
  };

  return {
    workflowSummaries,
    agents,
    selectedWorkflowId,
    setSelectedWorkflowId,
    workflow,
    runs,
    selectedRunId,
    setSelectedRunId,
    selectedRun,
    loadingWorkflows,
    loadingDetail,
    loadingRuns,
    loadingRunDetail,
    running,
    cancelling,
    error,
    handleRun,
    handleCancel,
  };
}
