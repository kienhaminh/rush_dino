export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  id: string;
  time: string;
  level: LogLevel;
  subsystem?: string;
  message: string;
  raw: string;
}

export interface LogsFilters {
  query: string;
  levels: Record<LogLevel, boolean>;
  autoFollow: boolean;
}

export const LEVEL_COLORS: Record<LogLevel, { text: string; bg: string; border: string }> = {
  trace: { text: 'text-zinc-500', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20' },
  debug: { text: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  info: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
  warn: { text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
  error: { text: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
  fatal: { text: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' },
};
