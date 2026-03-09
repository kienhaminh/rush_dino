import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ClockIcon,
  CalendarIcon,
  ArchiveIcon,
  MoreVertical,
  Play,
  Pause,
  Trash2,
  Edit2,
} from 'lucide-react';
import type { CronJob, CronJobsEnabledFilter, CronJobsSortBy, CronSortDir } from './cron-types';
import { cn } from '@/lib/utils';

interface CronListProps {
  jobs: CronJob[];
  loading: boolean;
  filters: {
    query: string;
    enabled: CronJobsEnabledFilter;
    sortBy: CronJobsSortBy;
    sortDir: CronSortDir;
  };
  onFilterChange: (patch: Partial<CronListProps['filters']>) => void;
  onToggle: (job: CronJob) => void;
  onEdit: (job: CronJob) => void;
  onRemove: (job: CronJob) => void;
  onRun: (job: CronJob) => void;
}

export function CronList({
  jobs,
  loading,
  filters,
  onFilterChange,
  onToggle,
  onEdit,
  onRemove,
  onRun,
}: CronListProps) {
  const formatNextRun = (ms: number | null) => {
    if (ms == null) return 'n/a';
    const diff = ms - Date.now();
    if (diff < 0) return 'Running...';
    const totalSecs = Math.floor(diff / 1000);
    const m = Math.floor(totalSecs / 60);
    const h = Math.floor(m / 60);

    if (h > 0) return `in ${h}h ${m % 60}m`;
    if (m > 0) return `in ${m}m ${totalSecs % 60}s`;
    return `in ${totalSecs}s`;
  };

  return (
    <div className="space-y-6">
      {/* Filters & Sorting */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-end">
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto scrollbar-none">
          <Select
            value={filters.enabled}
            onValueChange={(value) => onFilterChange({ enabled: value as CronJobsEnabledFilter })}
          >
            <SelectTrigger className="bg-card border border-border/40 text-foreground px-3 py-2 rounded-xl text-[12px] outline-none transition-all cursor-pointer hover:bg-muted/50 shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              <SelectItem value="enabled">Enabled</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.sortBy}
            onValueChange={(value) => onFilterChange({ sortBy: value as CronJobsSortBy })}
          >
            <SelectTrigger className="bg-card border border-border/40 text-foreground px-3 py-2 rounded-xl text-[12px] outline-none transition-all cursor-pointer hover:bg-muted/50 shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nextRunAtMs">Sort: Next Run</SelectItem>
              <SelectItem value="updatedAtMs">Sort: Recently Updated</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Jobs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jobs.map((job) => (
          <Card
            key={job.id}
            className="bg-card/40 border border-border/40 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 rounded-3xl overflow-hidden group border-b-[3px] border-b-transparent hover:border-b-primary shadow-sm"
          >
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-base tracking-tight leading-snug truncate max-w-[160px]">
                      {job.name}
                    </h3>
                    <div
                      className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        job.enabled
                          ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                          : 'bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.4)]',
                      )}
                    />
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
                    <ArchiveIcon className="w-3 h-3" /> Agent: {job.agentId}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onRun(job)}
                    className="p-1.5 hover:bg-emerald-500/10 hover:text-emerald-500 rounded-lg transition-colors"
                  >
                    <Play size={14} />
                  </button>
                  <button
                    onClick={() => onEdit(job)}
                    className="p-1.5 hover:bg-primary/10 hover:text-primary rounded-lg transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => onRemove(job)}
                    className="p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="bg-muted/30 border border-border/30 rounded-2xl p-3 mb-4">
                <div className="text-[11px] font-mono text-primary font-bold mb-1">
                  {job.schedule}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {job.scheduleKind === 'cron' ? 'Cron Expression' : 'Recurring Schedule'}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                    Next Execution
                  </span>
                  <span className="text-sm font-semibold">{formatNextRun(job.nextRunAtMs)}</span>
                </div>
                <button
                  onClick={() => onToggle(job)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all border shadow-sm active:scale-95',
                    job.enabled
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
                      : 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20',
                  )}
                >
                  {job.enabled ? (
                    <>
                      <Pause size={12} /> Paused
                    </>
                  ) : (
                    <>
                      <Play size={12} /> Resume
                    </>
                  )}
                </button>
              </div>
            </CardContent>
          </Card>
        ))}

        {jobs.length === 0 && !loading && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 px-4 bg-card/20 border-2 border-dashed border-border/40 rounded-[32px] text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <CalendarIcon className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-xl font-bold mb-2">No Cron Jobs Found</h3>
            <p className="text-muted-foreground text-sm max-w-xs">
              Create your first scheduled task to automate your swarm deployments.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
