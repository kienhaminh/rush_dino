// ---------------------------------------------------------------------------
// Cron types — mirror the Rust CronJobRecord / CronRunRecord structs
// ---------------------------------------------------------------------------

export interface ApiCronSchedule {
  kind: 'cron' | 'every' | 'at';
  expr?: string;            // kind=cron
  intervalSeconds?: number; // kind=every
  runAt?: string;           // kind=at
}

export interface ApiCronTarget {
  kind: 'agent_turn' | 'workflow';
  agentId?: string;
  workflowId?: string;
}

export type ApiCronJobState = 'idle' | 'running' | 'paused' | 'error';
export type ApiCronRunStatus = 'ok' | 'error' | 'blocked';

export interface ApiCronJobRecord {
  id: string;
  name: string;
  description: string;
  schedule: ApiCronSchedule;
  timezone: string | null;
  target: ApiCronTarget;
  enabled: boolean;
  reentrant: boolean;
  state: ApiCronJobState;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiCronRunRecord {
  id: string;
  jobId: string;
  status: ApiCronRunStatus;
  triggerKind: string;
  summary: string | null;
  error: string | null;
  sessionId: string | null;
  workflowRunId: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}
