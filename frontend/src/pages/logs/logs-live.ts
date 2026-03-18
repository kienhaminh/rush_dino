import type { RuntimeLogRecord } from '@/lib/types';

import type { LogEntry, LogLevel } from './logs-types';

const LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

function asLogLevel(level: string): LogLevel {
  if (LEVELS.includes(level as LogLevel)) {
    return level as LogLevel;
  }
  return 'info';
}

export function mapRuntimeLogRecord(record: RuntimeLogRecord): LogEntry {
  const date = new Date(record.createdAt);
  const time = Number.isNaN(date.getTime())
    ? record.createdAt
    : date.toLocaleTimeString([], { hour12: false });

  return {
    id: record.id,
    time,
    level: asLogLevel(record.level),
    subsystem: record.target,
    message: record.message,
    raw: JSON.stringify({
      time: record.createdAt,
      level: record.level,
      target: record.target,
      message: record.message,
      fields: record.fields ?? null,
    }),
  };
}

export function appendRuntimeLogRecord(
  existing: LogEntry[],
  record: RuntimeLogRecord,
  maxEntries = 500,
): LogEntry[] {
  const next = mapRuntimeLogRecord(record);
  const deduped = [next, ...existing.filter((entry) => entry.id !== next.id)];
  return deduped.slice(0, maxEntries);
}
