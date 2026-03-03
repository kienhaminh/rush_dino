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
