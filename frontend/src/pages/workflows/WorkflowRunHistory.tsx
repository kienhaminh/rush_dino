import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { WorkflowRunDetail, WorkflowRunListItem } from './workflow-types';

interface WorkflowRunHistoryProps {
  runs: WorkflowRunListItem[];
  selectedRunId: string | null;
  selectedRun: WorkflowRunDetail | null;
  loading: boolean;
  loadingDetail: boolean;
  onSelect: (runId: string) => void;
}

const STATUS_CLASSES: Record<string, string> = {
  running: 'text-primary bg-primary/10 border-primary/20',
  succeeded: 'text-success bg-success/10 border-success/20',
  failed: 'text-destructive bg-destructive/10 border-destructive/20',
  queued: 'text-warning bg-warning/10 border-warning/20',
};

const STATUS_DOT: Record<string, string> = {
  running: 'bg-primary animate-pulse',
  succeeded: 'bg-success',
  failed: 'bg-destructive',
  queued: 'bg-warning',
};

export function WorkflowRunHistory({
  runs,
  selectedRunId,
  selectedRun,
  loading,
  loadingDetail,
  onSelect,
}: WorkflowRunHistoryProps) {
  const [open, setOpen] = useState(false);

  const activeCount = runs.filter((r) => r.status === 'running' || r.status === 'queued').length;

  return (
    <div className="border-t border-border/50 bg-card/20">
      {/* Collapsed toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-6 py-2.5 text-xs hover:bg-muted/20 transition-colors"
      >
        <span className="font-semibold text-muted-foreground uppercase tracking-widest">Run History</span>
        {loading ? (
          <span className="text-muted-foreground">Loading...</span>
        ) : (
          <span className="text-muted-foreground">{runs.length} runs</span>
        )}
        {activeCount > 0 && (
          <span className="flex items-center gap-1.5 text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {activeCount} active
          </span>
        )}
        <div className="ml-auto text-muted-foreground/60">
          {open ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronUpIcon className="w-4 h-4" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/40">
          {/* Run pills row */}
          <div className="flex items-center gap-2 px-6 py-3 overflow-x-auto">
            {runs.length === 0 ? (
              <span className="text-xs text-muted-foreground">No runs yet. Run the workflow to see history.</span>
            ) : (
              runs.map((run) => {
                const isSelected = run.id === selectedRunId;
                const statusClass = STATUS_CLASSES[run.status] ?? 'text-muted-foreground bg-muted/10 border-border';
                const dotClass = STATUS_DOT[run.status] ?? 'bg-muted-foreground';
                return (
                  <button
                    key={run.id}
                    onClick={() => onSelect(run.id)}
                    className={`
                      flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all
                      ${isSelected ? `${statusClass} ring-1 ring-current/30` : 'border-border bg-background hover:bg-muted/30 text-muted-foreground'}
                    `}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                    {run.id.slice(0, 7)}
                  </button>
                );
              })
            )}
          </div>

          {/* Selected run detail */}
          {selectedRun || loadingDetail ? (
            <div className="border-t border-border/40 px-6 py-4 max-h-64 overflow-y-auto">
              {loadingDetail ? (
                <p className="text-xs text-muted-foreground">Loading run detail...</p>
              ) : selectedRun ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase border ${STATUS_CLASSES[selectedRun.status] ?? ''}`}
                    >
                      {selectedRun.status}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground font-mono">{selectedRun.id}</span>
                    {selectedRun.completedAt && (
                      <span className="text-[11px] text-muted-foreground ml-auto">{selectedRun.completedAt}</span>
                    )}
                  </div>
                  {selectedRun.error && (
                    <p className="text-xs text-destructive">{selectedRun.error}</p>
                  )}
                  <div className="space-y-2">
                    {selectedRun.steps.map((step) => (
                      <div key={step.id} className="rounded-md border border-border/60 bg-background/60 p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-semibold">{step.position}. {step.stepName}</p>
                          <Badge
                            variant="outline"
                            className={`text-[10px] border ${STATUS_CLASSES[step.status] ?? ''}`}
                          >
                            {step.status}
                          </Badge>
                        </div>
                        {step.output && (
                          <pre className="text-[11px] text-muted-foreground bg-muted/30 rounded p-1.5 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                            {step.output}
                          </pre>
                        )}
                        {step.error && <p className="text-[11px] text-destructive">{step.error}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
