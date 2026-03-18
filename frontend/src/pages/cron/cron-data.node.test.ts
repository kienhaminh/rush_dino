import { describe, expect, it } from 'vitest';

import type { ApiCronJobRecord } from '@/lib/types';

import { buildCronStatus, mapCronJobRecordToCard } from './cron-data';

function createJob(overrides: Partial<ApiCronJobRecord> = {}): ApiCronJobRecord {
  return {
    id: 'job-1',
    name: 'Daily digest',
    description: '',
    schedule: { kind: 'cron', expr: '0 9 * * *' },
    timezone: 'UTC',
    target: {
      kind: 'agent_turn',
      message: 'Summarize the queue',
      conversationId: null,
      title: null,
      agentId: 'researcher',
    },
    enabled: true,
    reentrant: false,
    state: 'active',
    lastRunAt: null,
    nextRunAt: '2026-03-16T09:00:00Z',
    lastError: null,
    createdAt: '2026-03-16T08:00:00Z',
    updatedAt: '2026-03-16T08:30:00Z',
    ...overrides,
  };
}

describe('cron-data', () => {
  it('maps agent-turn jobs to an explicit target agent label', () => {
    const job = mapCronJobRecordToCard(createJob());

    expect(job.agentId).toBe('researcher');
    expect(job.targetLabel).toBe('Agent: researcher');
    expect(job.schedule).toBe('0 9 * * *');
    expect(job.scheduleKind).toBe('cron');
  });

  it('maps workflow jobs to a workflow target label instead of an agent label', () => {
    const job = mapCronJobRecordToCard(
      createJob({
        target: {
          kind: 'workflow_run',
          workflowId: 'wf-nightly',
          input: 'full',
          triggeredBy: 'cron',
        },
      }),
    );

    expect(job.agentId).toBe('workflow');
    expect(job.targetLabel).toBe('Workflow: wf-nightly');
  });

  it('builds status from live jobs without a dedicated status endpoint', () => {
    const status = buildCronStatus([
      createJob({ enabled: true, nextRunAt: '2026-03-16T08:45:00Z' }),
      createJob({
        id: 'job-2',
        enabled: false,
        state: 'paused',
        nextRunAt: null,
      }),
    ]);

    expect(status).toEqual({
      enabled: true,
      jobsNum: 2,
      nextWakeAtMs: Date.parse('2026-03-16T08:45:00Z'),
    });
  });
});
