import { Badge } from '@/components/ui/badge';
import type { WorkflowRunDetail } from './workflow-types';

interface WorkflowRunDetailPanelProps {
  run: WorkflowRunDetail | null;
  loading: boolean;
}

export function WorkflowRunDetailPanel({ run, loading }: WorkflowRunDetailPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 h-full overflow-y-auto">
      <h4 className="text-sm font-semibold mb-3">Run Detail</h4>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading run detail...</p>
      ) : !run ? (
        <p className="text-xs text-muted-foreground">Select a run to inspect step outputs.</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-[10px] uppercase border-0 ${
                  run.status === 'running'
                    ? 'text-primary bg-primary/10'
                    : run.status === 'succeeded'
                      ? 'text-success bg-success/10'
                      : run.status === 'failed'
                        ? 'text-destructive bg-destructive/10'
                        : 'text-warning bg-warning/10'
                }`}
              >
                {run.status}
              </Badge>
              <span className="text-xs text-muted-foreground">run {run.id}</span>
            </div>
            <p className="text-xs text-muted-foreground">Started: {run.startedAt}</p>
            {run.completedAt && <p className="text-xs text-muted-foreground">Completed: {run.completedAt}</p>}
            {run.error && <p className="text-xs text-destructive">{run.error}</p>}
          </div>

          <div className="space-y-3">
            {run.steps.map((step) => (
              <div key={step.id} className="border border-border/70 rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">
                    {step.position}. {step.stepName}
                  </p>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase border-0 ${
                      step.status === 'running'
                        ? 'text-primary bg-primary/10'
                        : step.status === 'succeeded'
                          ? 'text-success bg-success/10'
                          : step.status === 'failed'
                            ? 'text-destructive bg-destructive/10'
                            : 'text-warning bg-warning/10'
                    }`}
                  >
                    {step.status}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">Agent: {step.agentId}</p>
                <pre className="text-[11px] bg-background rounded p-2 whitespace-pre-wrap break-words">
                  {step.input || '(no input)'}
                </pre>
                {step.output ? (
                  <pre className="text-[11px] bg-background rounded p-2 whitespace-pre-wrap break-words">
                    {step.output}
                  </pre>
                ) : null}
                {step.error ? <p className="text-[11px] text-destructive">{step.error}</p> : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
