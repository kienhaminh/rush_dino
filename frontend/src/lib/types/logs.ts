export interface RuntimeLogRecord {
  id: string;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | string;
  target: string;
  message: string;
  fields?: Record<string, unknown> | null;
  createdAt: string;
}

export interface FetchLogsResponse {
  items: RuntimeLogRecord[];
  nextCursor?: string;
}
