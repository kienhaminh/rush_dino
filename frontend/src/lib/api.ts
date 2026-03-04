import type {
  AppConfigView,
  Conversation,
  CredentialsView,
  FetchLogsResponse,
  Message,
  UsageMetricsResponse,
} from './types';
import type {
  AgentRecord,
  AgentRuntimeData,
  AgentFileRecord,
  AgentProgressBoardResponse,
} from '@/pages/agents/agent-types';
import type {
  CreateWorkflowInput,
  UpdateWorkflowInput,
  WorkflowDetail,
  WorkflowListItem,
  WorkflowRunDetail,
  WorkflowRunListItem,
  WorkflowRunStartResponse,
} from '@/pages/workflows/workflow-types';
import { getAgentRuntime as getMockRuntime } from '@/pages/agents/agent-mock-data';

async function parseJsonOrThrow(response: Response, endpoint: string) {
  const contentType = response.headers.get('content-type') ?? '';
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Request failed for ${endpoint} (${response.status})`);
  }

  if (!contentType.includes('application/json')) {
    if (raw.trimStart().startsWith('<')) {
      throw new Error(
        `API ${endpoint} returned HTML instead of JSON. Ensure rushdino-server is running with the new agents routes.`,
      );
    }
    throw new Error(`API ${endpoint} did not return JSON.`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`API ${endpoint} returned invalid JSON.`);
  }
}

export async function fetchConversations(): Promise<Conversation[]> {
  const response = await fetch('/api/conversations');
  const data = await parseJsonOrThrow(response, '/api/conversations');
  return data.items ?? [];
}

export async function fetchConversation(id: string): Promise<{ id: string; messages: Message[] }> {
  const response = await fetch(`/api/conversations/${id}`);
  return parseJsonOrThrow(response, `/api/conversations/${id}`);
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
}

export async function sendChat(conversationId: string | null, message: string) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, message }),
  });
  return parseJsonOrThrow(response, '/api/chat');
}

export async function fetchAgents(): Promise<AgentRecord[]> {
  const response = await fetch('/api/agents');
  const data = await parseJsonOrThrow(response, '/api/agents');
  return data.items ?? [];
}

export async function fetchAgentRuntime(agentId: string): Promise<AgentRuntimeData> {
  const endpoint = `/api/agents/${encodeURIComponent(agentId)}/runtime`;
  try {
    const response = await fetch(endpoint);
    const data = await parseJsonOrThrow(response, endpoint);
    // Merge soul + memory from mock layer until backend supports them
    const mockFallback = getMockRuntime(agentId);
    return {
      ...data,
      soul: data.soul ?? mockFallback.soul,
      memory: data.memory ?? mockFallback.memory,
    };
  } catch {
    // Backend not reachable — use full mock runtime
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

export async function fetchConfig(): Promise<AppConfigView> {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error(`Failed to fetch config: ${response.statusText}`);
  return response.json();
}

export async function patchConfig(patch: Partial<AppConfigView>): Promise<AppConfigView> {
  const response = await fetch('/api/config', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Failed to save config: ${response.statusText}`);
  return response.json();
}

export async function fetchCredentials(): Promise<CredentialsView> {
  const response = await fetch('/api/credentials');
  if (!response.ok) throw new Error(`Failed to fetch credentials: ${response.statusText}`);
  return response.json();
}

export async function patchCredentials(patch: Partial<CredentialsView>): Promise<CredentialsView> {
  const response = await fetch('/api/credentials', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Failed to save credentials: ${response.statusText}`);
  return response.json();
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

export async function fetchWorkflows(): Promise<WorkflowListItem[]> {
  const response = await fetch('/api/workflows');
  const data = await parseJsonOrThrow(response, '/api/workflows');
  return data.items ?? [];
}

export async function fetchWorkflow(workflowId: string): Promise<WorkflowDetail> {
  const endpoint = `/api/workflows/${encodeURIComponent(workflowId)}`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function createWorkflow(payload: CreateWorkflowInput): Promise<WorkflowDetail> {
  const endpoint = '/api/workflows';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function updateWorkflow(
  workflowId: string,
  payload: UpdateWorkflowInput,
): Promise<WorkflowDetail> {
  const endpoint = `/api/workflows/${encodeURIComponent(workflowId)}`;
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
  const endpoint = `/api/workflows/${encodeURIComponent(workflowId)}`;
  const response = await fetch(endpoint, { method: 'DELETE' });
  await parseJsonOrThrow(response, endpoint);
}

export async function startWorkflowRun(
  workflowId: string,
  payload: { input?: string; triggeredBy?: string } = {},
): Promise<WorkflowRunStartResponse> {
  const endpoint = `/api/workflows/${encodeURIComponent(workflowId)}/runs`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchWorkflowRuns(
  workflowId: string,
  limit = 20,
): Promise<WorkflowRunListItem[]> {
  const endpoint = `/api/workflows/${encodeURIComponent(workflowId)}/runs?limit=${limit}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function fetchWorkflowRun(runId: string): Promise<WorkflowRunDetail> {
  const endpoint = `/api/workflow-runs/${encodeURIComponent(runId)}`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchLogs(params?: {
  level?: string[];
  q?: string;
  limit?: number;
  cursor?: string;
}): Promise<FetchLogsResponse> {
  const query = new URLSearchParams();
  if (params?.level?.length) {
    query.set('level', params.level.join(','));
  }
  if (params?.q) {
    query.set('q', params.q);
  }
  if (params?.limit != null) {
    query.set('limit', String(params.limit));
  }
  if (params?.cursor) {
    query.set('cursor', params.cursor);
  }
  const endpoint = `/api/logs${query.size ? `?${query.toString()}` : ''}`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchUsageMetrics(params?: {
  start?: string;
  end?: string;
  provider?: string;
  model?: string;
  conversationId?: string;
  limit?: number;
}): Promise<UsageMetricsResponse> {
  const query = new URLSearchParams();
  if (params?.start) query.set('start', params.start);
  if (params?.end) query.set('end', params.end);
  if (params?.provider) query.set('provider', params.provider);
  if (params?.model) query.set('model', params.model);
  if (params?.conversationId) query.set('conversation_id', params.conversationId);
  if (params?.limit != null) query.set('limit', String(params.limit));
  const endpoint = `/api/usage/metrics${query.size ? `?${query.toString()}` : ''}`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}
