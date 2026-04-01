// Agents API — agent listing, runtime, progress board, health, messages, sessions, and file mutations.

import { parseJsonOrThrow } from './client';
import type { SessionSummary } from '../types';
import type {
  AgentRecord,
  AgentRuntimeData,
  AgentFileRecord,
  AgentProgressBoardResponse,
  AgentHealth,
} from '@/pages/agents/agent-types';
import { getAgentRuntime as getMockRuntime } from '@/pages/agents/agent-mock-data';
import { normalizeSessionSummary } from './conversations';

export type AgentMessageRecord = {
  id: string;
  fromAgent: string;
  toAgent: string;
  content: string;
  read: boolean;
  createdAt: string;
};

export async function fetchAgents(): Promise<AgentRecord[]> {
  const response = await fetch('/api/agents');
  const data = await parseJsonOrThrow(response, '/api/agents');
  return data.items ?? [];
}

export async function fetchAgentRuntime(agentId: string): Promise<AgentRuntimeData> {
  const endpoint = `/api/agents/${encodeURIComponent(agentId)}/runtime`;
  try {
    const data = await fetch(endpoint).then((r) => parseJsonOrThrow(r, endpoint));
    const mockFallback = getMockRuntime(agentId);
    return {
      ...data,
      skills: data.skills ?? [],
      soul: data.soul ?? mockFallback.soul,
      memory: data.memory ?? mockFallback.memory,
    };
  } catch {
    return getMockRuntime(agentId);
  }
}

export async function fetchAgentProgressBoard(params?: {
  lookbackMinutes?: number;
  perColumn?: number;
  activeWindowSeconds?: number;
}): Promise<AgentProgressBoardResponse> {
  const query = new URLSearchParams();
  if (params?.lookbackMinutes != null) {
    query.set('lookback_minutes', String(params.lookbackMinutes));
  }
  if (params?.perColumn != null) {
    query.set('per_column', String(params.perColumn));
  }
  if (params?.activeWindowSeconds != null) {
    query.set('active_window_seconds', String(params.activeWindowSeconds));
  }
  const endpoint = `/api/agents/progress${query.size ? `?${query.toString()}` : ''}`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchAgentHealth(agentId: string): Promise<AgentHealth> {
  const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/health`);
  return parseJsonOrThrow(res, `agents/${encodeURIComponent(agentId)}/health`);
}

export async function resetAgentHealth(agentId: string): Promise<void> {
  const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/health/reset`, { method: 'POST' });
  await parseJsonOrThrow(res, `agents/${encodeURIComponent(agentId)}/health/reset`);
}

export async function fetchMessages(params?: {
  agent?: string;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<AgentMessageRecord[]> {
  const searchParams = new URLSearchParams();
  if (params?.agent) searchParams.set('agent', params.agent);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.unreadOnly) searchParams.set('unread_only', 'true');
  const qs = searchParams.toString();
  const res = await fetch(`/api/messages${qs ? `?${qs}` : ''}`);
  const data = await parseJsonOrThrow(res, 'messages');
  return data.items;
}

export async function fetchAgentSessions(): Promise<SessionSummary[]> {
  const endpoint = '/api/agent-sessions';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return (data.items ?? []).map(normalizeSessionSummary);
}

export async function deleteAgent(id: string): Promise<void> {
  const endpoint = `/api/agents/${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, { method: 'DELETE' });
  await parseJsonOrThrow(response, endpoint);
}

export async function patchAgentFile(
  agentId: string,
  filename: string,
  content: string,
): Promise<AgentFileRecord> {
  const endpoint = `/api/agents/${encodeURIComponent(agentId)}/files/${encodeURIComponent(filename)}`;
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return parseJsonOrThrow(response, endpoint);
}
