import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { LogEntry, LogLevel } from './logs-types';

const LEVEL_COLORS: Record<LogLevel, { text: string; bg: string; border: string }> = {
  trace: { text: 'text-zinc-500', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20' },
  debug: { text: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  info: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
  warn: { text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
  error: { text: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
  fatal: { text: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' },
};

interface LogsStreamProps {
  entries: LogEntry[];
  autoFollow: boolean;
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
}

export function LogsStream({ entries, autoFollow, onScroll }: LogsStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFollow && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoFollow]);

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-40">
        <div className="w-16 h-16 rounded-3xl bg-muted/20 border border-border/40 flex items-center justify-center mb-4 transition-transform hover:scale-105">
          <span className="text-2xl">📝</span>
        </div>
        <h3 className="text-sm font-bold uppercase tracking-widest mb-1">No log entries</h3>
        <p className="text-xs max-w-xs leading-relaxed">
          Try adjusting your filters or search query to see system activity logs.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto overflow-x-auto h-full selection:bg-primary/20"
      ref={scrollRef}
      onScroll={onScroll}
    >
      <div className="min-w-fit w-full font-mono text-[13px] leading-relaxed p-4 space-y-0.5">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="group flex items-start gap-4 py-1 px-3 hover:bg-muted/30 rounded-md transition-colors border-l-2 border-transparent hover:border-primary/20"
          >
            {/* Time */}
            <div className="shrink-0 text-muted-foreground/60 w-20 select-none group-hover:text-muted-foreground/80 transition-colors tabular-nums">
              {entry.time}
            </div>

            {/* Level */}
            <div
              className={cn(
                'shrink-0 w-16 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-center border transition-all select-none',
                LEVEL_COLORS[entry.level].text,
                LEVEL_COLORS[entry.level].bg,
                LEVEL_COLORS[entry.level].border,
                'group-hover:scale-105 group-hover:shadow-[0_0_10px_rgba(0,0,0,0.2)]',
              )}
            >
              {entry.level}
            </div>

            {/* Subsystem */}
            {entry.subsystem && (
              <div className="shrink-0 text-indigo-400/80 w-24 truncate select-none hover:text-indigo-400 transition-colors">
                [{entry.subsystem}]
              </div>
            )}

            {/* Message */}
            <div className="flex-1 text-foreground/80 break-words group-hover:text-foreground transition-colors">
              {entry.message}
            </div>

            {/* Copy button or other utility could go here */}
          </div>
        ))}
        {/* Fill extra space for auto-follow visual */}
        <div className="h-4" />
      </div>
    </div>
  );
}
