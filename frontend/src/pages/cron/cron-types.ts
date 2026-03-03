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
  agentId: string;
  enabled: boolean;
  status: 'active' | 'paused' | 'error';
  updatedAtMs: number;
};

export type CronRunLogEntry = {
  id: string;
  jobId: string;
  jobName: string;
  status: 'ok' | 'error' | 'skipped';
  startedAtMs: number;
  durationMs: number;
  summary?: string;
  error?: string;
  deliveryStatus: 'delivered' | 'not-delivered' | 'unknown' | 'not-requested';
};

export type CronJobsEnabledFilter = 'all' | 'enabled' | 'disabled';
export type CronJobsSortBy = 'nextRunAtMs' | 'updatedAtMs' | 'name';
export type CronSortDir = 'asc' | 'desc';
export type CronRunScope = 'all' | 'job';
export type CronRunsStatusValue = 'ok' | 'error' | 'skipped';
export type CronDeliveryStatus = 'delivered' | 'not-delivered' | 'unknown' | 'not-requested';
