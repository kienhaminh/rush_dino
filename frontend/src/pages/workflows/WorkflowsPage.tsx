import { PlayIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { WorkflowSidebar } from './WorkflowSidebar';
import { WorkflowPipelineCanvas } from './WorkflowPipelineCanvas';
import { WorkflowRunHistory } from './WorkflowRunHistory';
import { useWorkflowPageState } from './use-workflow-page-state';

export function WorkflowsPage() {
  const {
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
    loadingRuns,
    loadingRunDetail,
    running,
    cancelling,
    error,
    handleRun,
    handleCancel,
  } = useWorkflowPageState();

  return (
    <div className="flex h-full w-full overflow-hidden flex-col bg-background">
      {/* Header bar: workflow picker + name + description + status + controls */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-card/20 flex-shrink-0">
        <WorkflowSidebar
          workflows={workflowSummaries}
          selectedId={selectedWorkflowId}
          loading={loadingWorkflows}
          onSelect={setSelectedWorkflowId}
        />
        {workflow ? (
          <>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
              <span className="text-sm font-semibold truncate">{workflow.name}</span>
              <span className="text-xs text-muted-foreground truncate">{workflow.description}</span>
            </div>
            <Badge
              variant={workflow.status === 'active' ? 'secondary' : 'outline'}
              className="text-[10px] shrink-0"
            >
              {workflow.status}
            </Badge>
            <button
              onClick={handleRun}
              disabled={running || workflow.status !== 'active' || workflow.steps.length === 0}
              className="h-7 px-2.5 rounded-md border border-border bg-background/70 hover:bg-muted/40 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
            >
              <PlayIcon className="w-3 h-3" />
              {running ? 'Running…' : 'Run'}
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Select a workflow.</p>
        )}
      </div>

      {/* Error banner */}
      {error ? (
        <div className="mx-6 mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex-shrink-0">
          {error}
        </div>
      ) : null}

      {/* Pipeline canvas — fills remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {workflow ? (
          <WorkflowPipelineCanvas key={workflow.id} workflow={workflow} agents={agents} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a workflow.
          </div>
        )}
      </div>

      {/* Run history — collapsible bottom panel */}
      {workflow && (
        <WorkflowRunHistory
          runs={runs}
          selectedRunId={selectedRunId}
          selectedRun={selectedRun}
          loading={loadingRuns}
          loadingDetail={loadingRunDetail}
          cancelling={cancelling}
          onSelect={setSelectedRunId}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

export default WorkflowsPage;
