import React from 'react';
import type { CronStatus } from './cron-types';

interface CronStatsProps {
  status: CronStatus | null;
}

export function CronStats({ status }: CronStatsProps) {
  const formatNextRun = (ms: number | null) => {
    if (ms == null) return 'n/a';
    const diff = ms - Date.now();
    if (diff < 0) return 'Running...';
    const totalSecs = Math.floor(diff / 1000);
    const m = Math.floor(totalSecs / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);

    if (d > 0) return `in ${d}d ${h % 24}h`;
    if (h > 0) return `in ${h}h ${m % 60}m`;
    if (m > 0) return `in ${m}m ${totalSecs % 60}s`;
    return `in ${totalSecs}s`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <div className="bg-card border border-border/40 p-4 rounded-2xl flex flex-col gap-2 shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
          System State
        </span>
        <div className="flex items-center gap-2.5">
          <div
            className={`w-2 h-2 rounded-full ${status?.enabled ? 'bg-success shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`}
          />
          <span className="text-lg font-bold">{status?.enabled ? 'Active' : 'Paused'}</span>
        </div>
      </div>

      <div className="bg-card border border-border/40 p-4 rounded-2xl flex flex-col gap-2 shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
          Total Jobs
        </span>
        <span className="text-lg font-bold">{status?.jobsNum ?? 'n/a'}</span>
      </div>

      <div className="bg-card border border-border/40 p-4 rounded-2xl flex flex-col gap-2 md:col-span-1 lg:col-span-2 shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
          Next Wake
        </span>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold">{formatNextRun(status?.nextWakeAtMs ?? null)}</span>
          {status?.nextWakeAtMs && (
            <span className="text-xs text-muted-foreground font-medium opacity-60">
              ({new Date(status.nextWakeAtMs).toLocaleTimeString()})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
