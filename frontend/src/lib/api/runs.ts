// Runs API — list, fetch, abort, and wait for run completion.

import { parseJsonOrThrow } from './client';
import type { RunSnapshot, RunDetail, RunKind, RunState } from '../types';

export async function fetchRuns(params?: {
  kind?: RunKind;
  state?: RunState;
  source?: string;
  channelId?: string;
  gatewaySessionId?: string;
  sessionId?: string;
  conversationId?: string;
  limit?: number;
}): Promise<RunSnapshot[]> {
  const query = new URLSearchParams();
  if (params?.kind) query.set('kind', params.kind);
  if (params?.state) query.set('state', params.state);
  if (params?.source) query.set('source', params.source);
  if (params?.channelId) query.set('channelId', params.channelId);
  if (params?.gatewaySessionId) query.set('gatewaySessionId', params.gatewaySessionId);
  if (params?.sessionId) query.set('sessionId', params.sessionId);
  if (params?.conversationId) query.set('conversationId', params.conversationId);
  if (params?.limit != null) query.set('limit', String(params.limit));
  const endpoint = `/api/runs${query.size ? `?${query.toString()}` : ''}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function fetchRun(runId: string): Promise<RunDetail> {
  const endpoint = `/api/runs/${encodeURIComponent(runId)}`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function abortRun(runId: string): Promise<RunSnapshot> {
  const endpoint = `/api/runs/${encodeURIComponent(runId)}/abort`;
  const response = await fetch(endpoint, { method: 'POST' });
  return parseJsonOrThrow(response, endpoint);
}

export async function waitForRun(
  runId: string,
  params?: { timeoutMs?: number; requireTerminal?: boolean },
): Promise<RunSnapshot> {
  const query = new URLSearchParams();
  if (params?.timeoutMs != null) query.set('timeoutMs', String(params.timeoutMs));
  if (params?.requireTerminal != null) {
    query.set('requireTerminal', String(params.requireTerminal));
  }
  const endpoint = `/api/runs/${encodeURIComponent(runId)}/wait${query.size ? `?${query.toString()}` : ''}`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}
