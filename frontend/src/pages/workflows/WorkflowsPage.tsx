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
import type {
  WorkflowDetail,
  WorkflowListItem,
  WorkflowRunDetail,
  WorkflowRunListItem,
} from './workflow-types';
import { WorkflowSidebar } from './WorkflowSidebar';
import { WorkflowEditorPanel, type WorkflowDraft } from './WorkflowEditorPanel';
import { WorkflowRunsPanel } from './WorkflowRunsPanel';
import { WorkflowRunDetailPanel } from './WorkflowRunDetailPanel';

function emptyDraft(defaultAgentId: string): WorkflowDraft {
  return {
    id: null,
    name: '',
    description: '',
    source: 'manual',
    status: 'draft',
    createdBy: 'user',
    steps: [
      {
        key: Math.random().toString(36).slice(2, 10),
        name: 'Step 1',
        instructions: '',
        agentId: defaultAgentId,
      },
    ],
  };
}

function mapDetailToDraft(detail: WorkflowDetail): WorkflowDraft {
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

export function WorkflowsPage() {
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
        if (current && nextWorkflows.some((workflow) => workflow.id === current)) {
          return current;
        }
        return nextWorkflows[0]?.id ?? null;
      });
      if (nextWorkflows.length === 0) {
        setDraft(emptyDraft(nextAgents[0]?.id ?? 'general-assistant'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      setLoadingWorkflows(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkflowSummaries();
  }, [loadWorkflowSummaries]);

  const loadSelectedWorkflow = useCallback(async (workflowId: string) => {
    setLoadingDetail(true);
    setLoadingRuns(true);
    try {
      const [detail, runItems] = await Promise.all([fetchWorkflow(workflowId), fetchWorkflowRuns(workflowId)]);
      setDraft(mapDetailToDraft(detail));
      setRuns(runItems);
      setSelectedRunId((current) => {
        if (current && runItems.some((run) => run.id === current)) return current;
        return runItems[0]?.id ?? null;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow detail');
    } finally {
      setLoadingDetail(false);
      setLoadingRuns(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedWorkflowId) return;
    void loadSelectedWorkflow(selectedWorkflowId);
  }, [selectedWorkflowId, loadSelectedWorkflow]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null);
      return;
    }

    let cancelled = false;
    const loadRunDetail = async () => {
      setLoadingRunDetail(true);
      try {
        const detail = await fetchWorkflowRun(selectedRunId);
        if (!cancelled) {
          setSelectedRun(detail);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load run detail');
        }
      } finally {
        if (!cancelled) setLoadingRunDetail(false);
      }
    };

    void loadRunDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  const hasActiveRun = useMemo(
    () => runs.some((run) => run.status === 'queued' || run.status === 'running'),
    [runs],
  );

  useEffect(() => {
    if (!selectedWorkflowId || !hasActiveRun) return;

    const interval = setInterval(() => {
      void (async () => {
        try {
          const runItems = await fetchWorkflowRuns(selectedWorkflowId);
          setRuns(runItems);
          if (selectedRunId) {
            const runDetail = await fetchWorkflowRun(selectedRunId);
            setSelectedRun(runDetail);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to refresh active run');
        }
      })();
    }, 2000);

    return () => clearInterval(interval);
  }, [selectedWorkflowId, hasActiveRun, selectedRunId]);

  const handleCreate = () => {
    setSelectedWorkflowId(null);
    setSelectedRunId(null);
    setSelectedRun(null);
    setDraft(emptyDraft(agents[0]?.id ?? 'general-assistant'));
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const payload = {
        name: draft.name,
        description: draft.description,
        status: draft.status,
        steps: draft.steps.map((step) => ({
          name: step.name,
          instructions: step.instructions,
          agentId: step.agentId,
        })),
      };

      const saved = draft.id
        ? await updateWorkflow(draft.id, payload)
        : await createWorkflow(payload);

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
      const [runItems, runDetail] = await Promise.all([
        fetchWorkflowRuns(draft.id),
        fetchWorkflowRun(started.runId),
      ]);
      setRuns(runItems);
      setSelectedRun(runDetail);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <WorkflowSidebar
        workflows={workflowSummaries}
        selectedId={selectedWorkflowId}
        loading={loadingWorkflows}
        onSelect={setSelectedWorkflowId}
        onCreate={handleCreate}
      />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {error ? (
          <div className="mx-6 mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-5">
          <WorkflowEditorPanel
            value={draft}
            agents={agents}
            saving={saving || loadingDetail}
            deleting={deleting}
            running={running}
            onChange={setDraft}
            onSave={handleSave}
            onDelete={handleDelete}
            onRun={handleRun}
          />

          <div className="grid grid-rows-2 gap-5 min-h-0">
            <WorkflowRunsPanel
              runs={runs}
              selectedRunId={selectedRunId}
              loading={loadingRuns}
              onSelect={setSelectedRunId}
            />
            <WorkflowRunDetailPanel run={selectedRun} loading={loadingRunDetail} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorkflowsPage;
