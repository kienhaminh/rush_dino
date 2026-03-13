import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { WorkflowRunListItem } from './workflow-types';

interface WorkflowRunsPanelProps {
  runs: WorkflowRunListItem[];
  loading: boolean;
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}

const STATUS_CLASS: Record<string, string> = {
  running: 'text-primary bg-primary/10',
  succeeded: 'text-success bg-success/10',
  failed: 'text-destructive bg-destructive/10',
  queued: 'text-warning bg-warning/10',
};

const BOARD_COLUMNS: Array<{
  key: WorkflowRunListItem['status'];
  label: string;
}> = [
  { key: 'queued', label: 'Queued' },
  { key: 'running', label: 'Running' },
  { key: 'failed', label: 'Blocked' },
  { key: 'succeeded', label: 'Done' },
];

function RunCard({
  run,
  active,
  onSelect,
}: {
  run: WorkflowRunListItem;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const statusClass = STATUS_CLASS[run.status] ?? 'text-muted-foreground bg-muted/10';
  return (
    <button
      onClick={() => onSelect(run.id)}
      className={`w-full rounded-md border px-3 py-2 text-left ${
        active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium truncate">{run.id.slice(0, 8)}</span>
        <Badge variant="outline" className={`text-[10px] uppercase border-0 ${statusClass}`}>
          {run.status}
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1 truncate">by {run.triggeredBy}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{run.startedAt}</p>
      {run.error ? (
        <p className="text-[11px] text-destructive mt-0.5 truncate">{run.error}</p>
      ) : null}
    </button>
  );
}

export function WorkflowRunsPanel({
  runs,
  loading,
  selectedRunId,
  onSelect,
}: WorkflowRunsPanelProps) {
  const [view, setView] = useState<'list' | 'board'>('list');

  const grouped = Object.fromEntries(
    BOARD_COLUMNS.map((col) => [col.key, runs.filter((r) => r.status === col.key)]),
  ) as Record<WorkflowRunListItem['status'], WorkflowRunListItem[]>;

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">Run History</h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{runs.length} runs</span>
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            <button
              onClick={() => setView('list')}
              className={`px-2 py-0.5 ${view === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/40'}`}
            >
              List
            </button>
            <button
              onClick={() => setView('board')}
              className={`px-2 py-0.5 ${view === 'board' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/40'}`}
            >
              Board
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading run history...</div>
      ) : runs.length === 0 ? (
        <div className="text-xs text-muted-foreground">No runs yet.</div>
      ) : view === 'list' ? (
        <div className="flex-1 overflow-y-auto space-y-2">
          {runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              active={run.id === selectedRunId}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {BOARD_COLUMNS.map((col) => (
              <section
                key={col.key}
                className="rounded-xl border border-border/50 bg-card/70 p-3 space-y-2 min-h-[120px]"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {col.label}
                  </p>
                  <Badge variant="outline" className="text-[10px] border-border/50 bg-muted/40">
                    {grouped[col.key].length}
                  </Badge>
                </div>
                {grouped[col.key].length === 0 ? (
                  <p className="text-xs text-muted-foreground">None</p>
                ) : (
                  <div className="space-y-2">
                    {grouped[col.key].map((run) => (
                      <RunCard
                        key={run.id}
                        run={run}
                        active={run.id === selectedRunId}
                        onSelect={onSelect}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
