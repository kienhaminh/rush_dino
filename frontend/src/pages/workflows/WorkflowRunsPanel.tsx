import { Badge } from '@/components/ui/badge';
import type { WorkflowRunListItem } from './workflow-types';

interface WorkflowRunsPanelProps {
  runs: WorkflowRunListItem[];
  loading: boolean;
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}

export function WorkflowRunsPanel({
  runs,
  loading,
  selectedRunId,
  onSelect,
}: WorkflowRunsPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">Run History</h4>
        <span className="text-xs text-muted-foreground">{runs.length} runs</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading run history...</div>
        ) : runs.length === 0 ? (
          <div className="text-xs text-muted-foreground">No runs yet.</div>
        ) : (
          runs.map((run) => {
            const active = run.id === selectedRunId;
            const statusClass =
              run.status === 'running'
                ? 'text-primary bg-primary/10'
                : run.status === 'succeeded'
                  ? 'text-success bg-success/10'
                  : run.status === 'failed'
                    ? 'text-destructive bg-destructive/10'
                    : 'text-warning bg-warning/10';
            return (
              <button
                key={run.id}
                onClick={() => onSelect(run.id)}
                className={`w-full rounded-md border px-3 py-2 text-left ${
                  active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{run.id.slice(0, 8)}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase border-0 ${statusClass}`}
                  >
                    {run.status}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 truncate">by {run.triggeredBy}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{run.startedAt}</p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
