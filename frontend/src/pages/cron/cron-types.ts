export type CronStatus = {
  enabled: boolean;
  jobsNum: number;
  nextWakeAtMs: number | null;
};

export type CronJob = {
  id: string;
  name: string;
  description?: string;
  schedule: string;
  scheduleKind: 'every' | 'at' | 'cron';
  nextRunAtMs: number | null;
  lastRunAtMs: number | null;
  lastError: string | null;
  agentId: string;
  targetLabel: string;
  enabled: boolean;
  status: 'active' | 'idle' | 'paused' | 'error';
  updatedAtMs: number;
};

export type CronRunLogEntry = {
  id: string;
  jobId: string;
  jobName: string;
  status: 'ok' | 'error' | 'blocked';
  triggerKind: string;
  startedAtMs: number;
  durationMs: number;
  summary?: string;
  error?: string;
  sessionId?: string;
  workflowRunId?: string;
};

export type CronJobsEnabledFilter = 'all' | 'enabled' | 'disabled';
export type CronJobsSortBy = 'nextRunAtMs' | 'updatedAtMs' | 'name';
export type CronSortDir = 'asc' | 'desc';
export type CronRunsStatusFilter = 'all' | 'ok' | 'error' | 'blocked';
