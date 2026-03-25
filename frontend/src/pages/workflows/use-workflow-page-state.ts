/**
 * useWorkflowPageState — manages all data fetching, state, and handlers for WorkflowsPage.
 * Keeps the page component focused purely on layout and rendering.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createWorkflow,
  deleteWorkflow,
  fetchAgents,
  fetchWorkflow,
  fetchWorkflowRun,
  fetchWorkflowRuns,
  fetchWorkflows,
  startWorkflowRun,
  updateWorkflow,
} from '@/lib/api';
import type { AgentRecord } from '@/pages/agents/agent-types';
import type { WorkflowDetail, WorkflowListItem, WorkflowRunDetail, WorkflowRunListItem } from './workflow-types';
import type { WorkflowDraft } from './WorkflowEditorPanel';

function emptyDraft(defaultAgentId: string): WorkflowDraft {
  return {
    id: null,
    name: '',
    description: '',
    source: 'manual',
    status: 'draft',
    createdBy: 'user',
    steps: [{ key: Math.random().toString(36).slice(2, 10), name: 'Step 1', instructions: '', agentId: defaultAgentId }],
  };
}

export function mapDetailToDraft(detail: WorkflowDetail): WorkflowDraft {
  return {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    source: detail.source,
    status: detail.status,
    createdBy: detail.createdBy,
    steps: detail.steps.map((step) => ({
      key: step.id,
      name: step.name,
      instructions: step.instructions,
      agentId: step.agentId,
    })),
  };
}

export function useWorkflowPageState() {
  const [workflowSummaries, setWorkflowSummaries] = useState<WorkflowListItem[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [runs, setRuns] = useState<WorkflowRunListItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<WorkflowRunDetail | null>(null);

  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingRunDetail, setLoadingRunDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [running, setRunning] = useState(false);
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
      if (nextWorkflows.length === 0) setDraft(emptyDraft(nextAgents[0]?.id ?? ''));
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
      setDraft(mapDetailToDraft(detail));
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

  const handleCreate = () => {
    setSelectedWorkflowId(null);
    setSelectedRunId(null);
    setSelectedRun(null);
    setDraft(emptyDraft(agents[0]?.id ?? ''));
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const payload = {
        name: draft.name,
        description: draft.description,
        status: draft.status,
        steps: draft.steps.map((s) => ({ name: s.name, instructions: s.instructions, agentId: s.agentId })),
      };
      const saved = draft.id ? await updateWorkflow(draft.id, payload) : await createWorkflow(payload);
      setDraft(mapDetailToDraft(saved));
      setSelectedWorkflowId(saved.id);
      await loadWorkflowSummaries();
      await loadSelectedWorkflow(saved.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workflow');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!draft?.id) return;
    setDeleting(true);
    try {
      await deleteWorkflow(draft.id);
      setDraft(null);
      setSelectedRun(null);
      setSelectedRunId(null);
      await loadWorkflowSummaries();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workflow');
    } finally {
      setDeleting(false);
    }
  };

  const handleRun = async () => {
    if (!draft?.id) return;
    setRunning(true);
    try {
      const started = await startWorkflowRun(draft.id, { triggeredBy: 'user' });
      setSelectedRunId(started.runId);
      const [runItems, runDetail] = await Promise.all([fetchWorkflowRuns(draft.id), fetchWorkflowRun(started.runId)]);
      setRuns(runItems);
      setSelectedRun(runDetail);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
      setRunning(false);
    }
  };

  return {
    workflowSummaries,
    agents,
    selectedWorkflowId,
    setSelectedWorkflowId,
    draft,
    setDraft,
    runs,
    selectedRunId,
    setSelectedRunId,
    selectedRun,
    loadingWorkflows,
    loadingDetail,
    loadingRuns,
    loadingRunDetail,
    saving,
    deleting,
    running,
    error,
    handleCreate,
    handleSave,
    handleDelete,
    handleRun,
  };
}
