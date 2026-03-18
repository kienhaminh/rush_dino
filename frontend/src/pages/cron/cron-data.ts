import type { ApiCronJobRecord, ApiCronRunRecord } from '@/lib/types';

import type { CronJob, CronRunLogEntry, CronStatus } from './cron-types';

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatSchedule(job: ApiCronJobRecord): string {
  switch (job.schedule.kind) {
    case 'cron':
      return job.schedule.expr;
    case 'every':
      return `Every ${job.schedule.intervalSeconds} seconds`;
    case 'at':
      return job.schedule.runAt;
  }
}

function deriveTarget(job: ApiCronJobRecord): { agentId: string; targetLabel: string } {
  if (job.target.kind === 'agent_turn') {
    const agentId = job.target.agentId?.trim() || 'general-assistant';
    return {
      agentId,
      targetLabel: `Agent: ${agentId}`,
    };
  }

  return {
    agentId: 'workflow',
    targetLabel: `Workflow: ${job.target.workflowId}`,
  };
}

export function mapCronJobRecordToCard(job: ApiCronJobRecord): CronJob {
  const target = deriveTarget(job);

  return {
    id: job.id,
    name: job.name,
    description: job.description,
    schedule: formatSchedule(job),
    scheduleKind: job.schedule.kind,
    nextRunAtMs: parseTimestamp(job.nextRunAt),
    agentId: target.agentId,
    targetLabel: target.targetLabel,
    enabled: job.enabled,
    status: job.state === 'running' ? 'active' : job.state,
    updatedAtMs: parseTimestamp(job.updatedAt) ?? 0,
  };
}

export function mapCronRunRecordToEntry(
  run: ApiCronRunRecord,
  jobsById: Map<string, ApiCronJobRecord>,
): CronRunLogEntry {
  const startedAtMs = parseTimestamp(run.startedAt) ?? 0;
  const completedAtMs = parseTimestamp(run.completedAt);
  const durationMs =
    completedAtMs != null && completedAtMs >= startedAtMs ? completedAtMs - startedAtMs : 0;

  return {
    id: run.id,
    jobId: run.jobId,
    jobName: jobsById.get(run.jobId)?.name ?? run.jobId,
    status: run.status === 'ok' ? 'ok' : 'error',
    startedAtMs,
    durationMs,
    summary: run.summary ?? undefined,
    error: run.error ?? undefined,
    deliveryStatus: 'not-requested',
  };
}

export function buildCronStatus(jobs: ApiCronJobRecord[]): CronStatus {
  const nextWakeAtMs =
    jobs
      .map((job) => parseTimestamp(job.nextRunAt))
      .filter((value): value is number => value != null)
      .sort((a, b) => a - b)[0] ?? null;

  return {
    enabled: jobs.some((job) => job.enabled),
    jobsNum: jobs.length,
    nextWakeAtMs,
  };
}
