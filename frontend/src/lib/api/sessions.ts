// Sessions API — list sessions and fetch session run history.

import { parseJsonOrThrow } from './client';
import type { SessionSummary, RunSnapshot } from '../types';
import { normalizeSessionSummary } from './conversations';

export async function fetchSessions(): Promise<SessionSummary[]> {
  const endpoint = '/api/sessions';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return (data.items ?? []).map(normalizeSessionSummary);
}

export async function fetchSessionRuns(sessionId: string, limit = 20): Promise<RunSnapshot[]> {
  const endpoint = `/api/sessions/${encodeURIComponent(sessionId)}/runs?limit=${limit}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}
