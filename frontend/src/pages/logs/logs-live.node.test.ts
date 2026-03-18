import { describe, expect, it } from 'vitest';

import type { RuntimeLogRecord } from '@/lib/types';

import { appendRuntimeLogRecord, mapRuntimeLogRecord } from './logs-live';

function createRecord(overrides: Partial<RuntimeLogRecord> = {}): RuntimeLogRecord {
  return {
    id: 'log-1',
    level: 'info',
    target: 'gateway',
    message: 'connected',
    fields: { source: 'test' },
    createdAt: '2026-03-17T00:00:00Z',
    ...overrides,
  };
}

describe('logs-live', () => {
  it('maps runtime log records into visible log entries', () => {
    const entry = mapRuntimeLogRecord(createRecord());

    expect(entry.level).toBe('info');
    expect(entry.subsystem).toBe('gateway');
    expect(entry.message).toBe('connected');
    expect(entry.raw).toContain('"target":"gateway"');
  });

  it('prepends new runtime log records and dedupes by id', () => {
    const existing = [mapRuntimeLogRecord(createRecord({ id: 'log-0', message: 'older' }))];
    const next = appendRuntimeLogRecord(existing, createRecord({ id: 'log-1', message: 'newer' }));
    const deduped = appendRuntimeLogRecord(next, createRecord({ id: 'log-1', message: 'newer' }));

    expect(next.map((item) => item.id)).toEqual(['log-1', 'log-0']);
    expect(deduped.map((item) => item.id)).toEqual(['log-1', 'log-0']);
  });
});
