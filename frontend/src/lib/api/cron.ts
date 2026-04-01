// Cron API — list, fetch, pause, resume, run now, and delete cron jobs.

import { parseJsonOrThrow } from './client';
import type { ApiCronJobRecord, ApiCronRunRecord } from '../types';

export async function fetchCronJobs(): Promise<ApiCronJobRecord[]> {
  const endpoint = '/api/cron';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function fetchCronJob(id: string): Promise<{ job: ApiCronJobRecord; runs: ApiCronRunRecord[] }> {
  const endpoint = `/api/cron/${encodeURIComponent(id)}`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchCronRuns(jobId: string, limit = 50): Promise<ApiCronRunRecord[]> {
  const endpoint = `/api/cron/${encodeURIComponent(jobId)}/runs?limit=${limit}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function pauseCronJob(id: string): Promise<ApiCronJobRecord> {
  const endpoint = `/api/cron/${encodeURIComponent(id)}/pause`;
  const response = await fetch(endpoint, { method: 'POST' });
  return parseJsonOrThrow(response, endpoint);
}

export async function resumeCronJob(id: string): Promise<ApiCronJobRecord> {
  const endpoint = `/api/cron/${encodeURIComponent(id)}/resume`;
  const response = await fetch(endpoint, { method: 'POST' });
  return parseJsonOrThrow(response, endpoint);
}

export async function runCronJobNow(id: string): Promise<{ job: ApiCronJobRecord; sessionId: string | null; workflowRunId: string | null }> {
  const endpoint = `/api/cron/${encodeURIComponent(id)}/run`;
  const response = await fetch(endpoint, { method: 'POST' });
  return parseJsonOrThrow(response, endpoint);
}

export async function deleteCronJob(id: string): Promise<void> {
  const endpoint = `/api/cron/${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, { method: 'DELETE' });
  await parseJsonOrThrow(response, endpoint);
}
