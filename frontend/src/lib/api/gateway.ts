// Gateway API — summary, adapter states, session management, and adapter restarts.

import { parseJsonOrThrow } from './client';
import type { GatewaySummaryResponse, GatewayAdapterState, GatewaySessionSummary } from '../types';

export async function fetchGatewaySummary(): Promise<GatewaySummaryResponse> {
  const endpoint = '/api/gateway/summary';
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchGatewayAdapters(): Promise<GatewayAdapterState[]> {
  const endpoint = '/api/gateway/adapters';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function fetchGatewaySessions(): Promise<GatewaySessionSummary[]> {
  const endpoint = '/api/gateway/sessions';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function resetGatewaySession(sessionId: string): Promise<void> {
  const endpoint = `/api/gateway/sessions/${encodeURIComponent(sessionId)}/reset`;
  const response = await fetch(endpoint, { method: 'POST' });
  await parseJsonOrThrow(response, endpoint);
}

export async function restartGatewayAdapter(channelId: string): Promise<void> {
  const endpoint = `/api/gateway/adapters/${encodeURIComponent(channelId)}/restart`;
  const response = await fetch(endpoint, { method: 'POST' });
  await parseJsonOrThrow(response, endpoint);
}
