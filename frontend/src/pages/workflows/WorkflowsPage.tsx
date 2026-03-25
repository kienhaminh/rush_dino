import { WorkflowSidebar } from './WorkflowSidebar';
import { WorkflowPipelineCanvas } from './WorkflowPipelineCanvas';
import { WorkflowRunHistory } from './WorkflowRunHistory';
import { useWorkflowPageState } from './use-workflow-page-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PlayIcon, Trash2Icon, SaveIcon } from 'lucide-react';
import type { WorkflowDraft } from './WorkflowEditorPanel';

export function WorkflowsPage() {
  const {
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
  } = useWorkflowPageState();

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
        {/* Header bar: workflow name + status + controls */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border/50 bg-card/20 flex-shrink-0">
          {draft ? (
            <>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Workflow name"
                className="flex-1 min-w-0 bg-transparent text-sm font-semibold placeholder:text-muted-foreground/50 outline-none"
              />
              <Select
                value={draft.status}
                onValueChange={(val) => setDraft({ ...draft, status: val as WorkflowDraft['status'] })}
              >
                <SelectTrigger className="h-7 w-24 text-xs border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">draft</SelectItem>
                  <SelectItem value="active">active</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleRun}
                  disabled={running || draft.status !== 'active' || draft.steps.length === 0}
                  className="h-7 px-2.5 rounded-md border border-border bg-background/70 hover:bg-muted/40 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                >
                  <PlayIcon className="w-3 h-3" />
                  {running ? 'Running…' : 'Run'}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || !draft.id}
                  className="h-7 px-2.5 rounded-md border border-destructive/30 text-destructive/70 hover:text-destructive hover:bg-destructive/10 text-xs font-medium disabled:opacity-40 flex items-center gap-1.5 transition-colors"
                >
                  <Trash2Icon className="w-3 h-3" />
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || loadingDetail}
                  className="h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
                >
                  <SaveIcon className="w-3 h-3" />
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a workflow or create a new one.</p>
          )}
        </div>

        {/* Error banner */}
        {error ? (
          <div className="mx-6 mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex-shrink-0">
            {error}
          </div>
        ) : null}

        {/* Description row */}
        {draft && (
          <div className="px-6 py-2 border-b border-border/30 flex-shrink-0">
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Add a description…"
              className="w-full bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/40 outline-none"
            />
          </div>
        )}

        {/* Pipeline canvas — fills remaining space */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {draft ? (
            <WorkflowPipelineCanvas draft={draft} agents={agents} onChange={setDraft} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a workflow or create a new one.
            </div>
          )}
        </div>

        {/* Run history — collapsible bottom panel */}
        {draft?.id && (
          <WorkflowRunHistory
            runs={runs}
            selectedRunId={selectedRunId}
            selectedRun={selectedRun}
            loading={loadingRuns}
            loadingDetail={loadingRunDetail}
            onSelect={setSelectedRunId}
          />
        )}
      </div>
    </div>
  );
}

export default WorkflowsPage;
