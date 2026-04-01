import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ClockIcon,
  LayoutList,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronRight,
} from 'lucide-react';
import type { CronRunLogEntry, CronRunsStatusFilter, CronSortDir } from './cron-types';
import { cn } from '@/lib/utils';

interface CronHistoryProps {
  runs: CronRunLogEntry[];
  loading: boolean;
  total: number;
  filters: {
    query: string;
    statusFilter: CronRunsStatusFilter;
    sortDir: CronSortDir;
  };
  onFilterChange: (patch: Partial<CronHistoryProps['filters']>) => void;
}

export function CronHistory({ runs, loading, total, filters, onFilterChange }: CronHistoryProps) {
  const getStatusIcon = (status: CronRunLogEntry['status']) => {
    switch (status) {
      case 'ok':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'blocked':
        return <MinusCircle className="w-4 h-4 text-warning" />;
    }
  };

  const getStatusLabel = (status: CronRunLogEntry['status']) => {
    switch (status) {
      case 'ok':
        return 'Success';
      case 'error':
        return 'Failed';
      case 'blocked':
        return 'Blocked';
    }
  };

  const formatRelativeTimestamp = (ms: number) => {
    const diff = Date.now() - ms;
    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'just now';
  };

  const formatMs = (ms: number) => {
    if (ms === 0) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTrigger = (kind: string) => {
    if (kind === 'manual') return 'Manual';
    if (kind === 'schedule') return 'Scheduled';
    return kind;
  };

  return (
    <div className="space-y-6">
      {/* Filters & Sorting */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <span className="text-[12px] text-muted-foreground font-medium">
          {total} total run{total !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto scrollbar-none">
          <Select
            value={filters.statusFilter}
            onValueChange={(value) =>
              onFilterChange({ statusFilter: value as CronRunsStatusFilter })
            }
          >
            <SelectTrigger className="bg-card border border-border/40 text-foreground px-3 py-2 rounded-xl text-[12px] outline-none transition-all cursor-pointer hover:bg-muted/50 shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="ok">Success</SelectItem>
              <SelectItem value="error">Failed</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.sortDir}
            onValueChange={(value) => onFilterChange({ sortDir: value as CronSortDir })}
          >
            <SelectTrigger className="bg-card border border-border/40 text-foreground px-3 py-2 rounded-xl text-[12px] outline-none transition-all cursor-pointer hover:bg-muted/50 shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest First</SelectItem>
              <SelectItem value="asc">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-3">
        {runs.map((run) => (
          <div
            key={run.id}
            className="group relative flex items-center gap-4 bg-card/40 border border-border/40 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 p-4 rounded-2xl"
          >
            {/* Status Icon */}
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0',
                run.status === 'ok'
                  ? 'bg-success/10'
                  : run.status === 'error'
                    ? 'bg-destructive/10'
                    : 'bg-warning/10',
              )}
            >
              {getStatusIcon(run.status)}
            </div>

            {/* Run Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-[13px] truncate">{run.jobName}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 shrink-0">
                  {getStatusLabel(run.status)}
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/40 ml-auto whitespace-nowrap">
                  {formatRelativeTimestamp(run.startedAtMs)}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[11px] font-medium text-muted-foreground truncate">
                  {run.error
                    ? run.error
                    : (run.summary ?? (run.status === 'ok' ? 'Completed successfully' : 'No summary'))}
                </span>
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                  {/* Trigger badge */}
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-muted/50 text-muted-foreground rounded-lg px-2 py-0.5">
                    {formatTrigger(run.triggerKind)}
                  </span>
                  {/* Duration */}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono bg-muted/50 rounded-lg px-2 py-0.5">
                    <ClockIcon className="w-2.5 h-2.5" />
                    {formatMs(run.durationMs)}
                  </div>
                </div>
              </div>
            </div>

            {/* Session link arrow (shown if sessionId present) */}
            {run.sessionId && (
              <div className="shrink-0 pl-2">
                <div
                  className="w-8 h-8 rounded-full bg-muted/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all group-hover:bg-primary/10 group-hover:text-primary active:scale-90 cursor-pointer"
                  title={`Session: ${run.sessionId}`}
                >
                  <ChevronRight size={14} />
                </div>
              </div>
            )}
          </div>
        ))}

        {runs.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 px-4 bg-card/20 border-2 border-dashed border-border/40 rounded-[32px] text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground/30">
              <LayoutList className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-2">No Execution Logs</h3>
            <p className="text-muted-foreground text-sm max-w-xs">
              Waiting for the next scheduled task execution.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
