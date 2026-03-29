import type {
  ApprovalsResponse,
  AppConfigView,
  AuditEntry,
  ChannelPairingState,
  Conversation,
  ConversationDetail,
  CredentialsView,
  DashboardAuthStatusResponse,
  DoctorReportResponse,
  FetchLogsResponse,
  GatewayAdapterState,
  GatewaySessionSummary,
  GatewaySummaryResponse,
  Message,
  RunDetail,
  RunKind,
  RunSnapshot,
  RunState,
  McpServerStatus,
  SandboxMcpPolicy,
  SandboxNetworkPolicy,
  SandboxPolicy,
  SandboxProcessPolicy,
  SessionSummary,
  SoulMemoryFile,
  SoulMemoryStateResponse,
  RegisteredTool,
  SkillRecord,
  SystemSummaryResponse,
  InputRequestStatus,
  UsageMetricsResponse,
  GraphStats,
  GraphFact,
  GraphEntity,
  GraphNode,
  IngestStats,
} from './types';
import type {
  AgentRecord,
  AgentRuntimeData,
  AgentSkillRecord,
  AgentFileRecord,
  AgentProgressBoardResponse,
  AgentHealth,
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

export const DASHBOARD_AUTH_REQUIRED_EVENT = 'rushdino:dashboard-auth-required';

export async function parseJsonOrThrow(response: Response, endpoint: string) {
  const contentType = response.headers.get('content-type') ?? '';
  const raw = await response.text();

  if (!response.ok) {
    if (contentType.includes('application/json')) {
      try {
        const data = JSON.parse(raw);
        if (response.status === 401 && data?.error === 'dashboard_auth_required') {
          window.dispatchEvent(new CustomEvent(DASHBOARD_AUTH_REQUIRED_EVENT));
        }
        const errorMessage =
          typeof data?.error === 'string'
            ? data.error
            : typeof data?.message === 'string'
              ? data.message
              : null;
        if (errorMessage) {
          throw new Error(errorMessage);
        }
      } catch (error) {
        if (error instanceof Error && error.message) {
          throw error;
        }
      }
    }
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

export async function fetchDashboardAuthStatus(): Promise<DashboardAuthStatusResponse> {
  const response = await fetch('/api/dashboard-auth/status');
  return parseJsonOrThrow(response, '/api/dashboard-auth/status');
}

export async function exchangeDashboardAuthCode(
  code: string,
): Promise<DashboardAuthStatusResponse> {
  const response = await fetch('/api/dashboard-auth/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return parseJsonOrThrow(response, '/api/dashboard-auth/exchange');
}

export async function logoutDashboardAuthSession(): Promise<void> {
  const response = await fetch('/api/dashboard-auth/logout', { method: 'POST' });
  if (!response.ok) {
    await parseJsonOrThrow(response, '/api/dashboard-auth/logout');
  }
}

export async function fetchConversations(): Promise<Conversation[]> {
  const response = await fetch('/api/conversations');
  const data = await parseJsonOrThrow(response, '/api/conversations');
  return data.items ?? [];
}

function normalizeSessionSummary(session: SessionSummary): SessionSummary {
  return {
    ...session,
    contextWindow: session.contextWindow ?? {},
  };
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  const response = await fetch(`/api/conversations/${id}`);
  return parseJsonOrThrow(response, `/api/conversations/${id}`);
}

export async function resolveInputRequest(
  requestId: string,
  payload:
    | { status: 'submitted'; values: Record<string, unknown> }
    | { status: 'cancelled' },
): Promise<{ requestId: string; status: InputRequestStatus }> {
  const endpoint = `/api/input-requests/${encodeURIComponent(requestId)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
}

export async function resetSession(id: string): Promise<void> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(id)}/reset`, { method: 'POST' });
  await parseJsonOrThrow(response, `/api/sessions/${id}/reset`);
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

function mergeSkills(runtimeSkills: AgentSkillRecord[], globalSkills: SkillRecord[]): AgentSkillRecord[] {
  const runtimeNames = new Set(runtimeSkills.map((s) => s.name));
  const fromGlobal: AgentSkillRecord[] = globalSkills
    .filter((s) => !runtimeNames.has(s.name))
    .map((s) => ({
      name: s.name,
      description: s.description,
      group: s.isBuiltIn ? ('built-in' as const) : ('workspace' as const),
      source: s.isBuiltIn ? 'builtin' : 'workspace',
      enabled: true,
    }));
  return [...runtimeSkills, ...fromGlobal].sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchAgentRuntime(agentId: string): Promise<AgentRuntimeData> {
  const endpoint = `/api/agents/${encodeURIComponent(agentId)}/runtime`;
  try {
    const [data, globalSkills] = await Promise.all([
      fetch(endpoint).then((r) => parseJsonOrThrow(r, endpoint)),
      fetchSkills().catch(() => [] as SkillRecord[]),
    ]);
    const mockFallback = getMockRuntime(agentId);
    return {
      ...data,
      skills: mergeSkills(data.skills ?? [], globalSkills),
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

export type AgentMessageRecord = {
  id: string;
  fromAgent: string;
  toAgent: string;
  content: string;
  read: boolean;
  createdAt: string;
};

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

export async function fetchSystemPrompt(): Promise<{ content: string; tokenEstimate: number }> {
  const endpoint = '/api/system/prompt';
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchRegisteredTools(): Promise<RegisteredTool[]> {
  const endpoint = '/api/system/tools';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.tools;
}

export async function fetchSoulMemoryState(): Promise<SoulMemoryStateResponse> {
  const endpoint = '/api/system/soul-memory';
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function patchSoulMemoryFile(filename: string, content: string): Promise<SoulMemoryFile> {
  const endpoint = '/api/system/soul-memory/file';
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename, content }),
  });
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

export async function fetchSessions(): Promise<SessionSummary[]> {
  const endpoint = '/api/sessions';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return (data.items ?? []).map(normalizeSessionSummary);
}

export async function fetchAgentSessions(): Promise<SessionSummary[]> {
  const endpoint = '/api/agent-sessions';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return (data.items ?? []).map(normalizeSessionSummary);
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

export async function fetchApprovals(): Promise<ApprovalsResponse> {
  const endpoint = '/api/approvals';
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchChannelPairing(channel: string): Promise<ChannelPairingState> {
  const endpoint = `/api/channels/${encodeURIComponent(channel)}/pairing`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function resolveChannelPairingRequest(
  channel: string,
  requestId: string,
  approved: boolean,
): Promise<{ requestId: string; status: string }> {
  const endpoint = `/api/channels/${encodeURIComponent(channel)}/pairing/${encodeURIComponent(requestId)}/decision`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approved }),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function revokeChannelPairedUser(
  channel: string,
  senderId: string,
): Promise<{ channelId: string; senderId: string; revoked: boolean }> {
  const endpoint = `/api/channels/${encodeURIComponent(channel)}/pairing/paired/${encodeURIComponent(senderId)}`;
  const response = await fetch(endpoint, {
    method: 'DELETE',
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function resolveApproval(
  requestId: string,
  payload: { approved: boolean; sessionId: string },
): Promise<{ request_id: string; status: string }> {
  const endpoint = `/api/approval/${encodeURIComponent(requestId)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      approved: payload.approved,
      session_id: payload.sessionId,
    }),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchSystemSummary(): Promise<SystemSummaryResponse> {
  const endpoint = '/api/system/summary';
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function patchThinkingLevel(level: string): Promise<void> {
  const endpoint = '/api/system/thinking-level';
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  });
  await parseJsonOrThrow(response, endpoint);
}

export async function fetchDoctorReport(): Promise<DoctorReportResponse> {
  const endpoint = '/api/system/doctor';
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

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

export async function fetchSessionRuns(sessionId: string, limit = 20): Promise<RunSnapshot[]> {
  const endpoint = `/api/sessions/${encodeURIComponent(sessionId)}/runs?limit=${limit}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

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

export interface UpsertSkillRequest {
  name: string;
  description: string;
  instructions: string;
  tools?: string[];
}

export async function fetchSkills(): Promise<SkillRecord[]> {
  const endpoint = '/api/skills';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function upsertSkill(payload: UpsertSkillRequest): Promise<SkillRecord> {
  const endpoint = '/api/skills';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function deleteSkill(name: string): Promise<void> {
  const endpoint = `/api/skills/${encodeURIComponent(name)}`;
  const response = await fetch(endpoint, { method: 'DELETE' });
  await parseJsonOrThrow(response, endpoint);
}

export async function mutateManagedFile(payload: {
  action: 'create' | 'delete' | 'move';
  relative_path?: string;
  content?: string;
  from_path?: string;
  to_path?: string;
  dry_run?: boolean;
}): Promise<{
  action: string;
  dryRun: boolean;
  sourcePath: string;
  targetPath?: string | null;
  allowedRoot: string;
}> {
  const endpoint = '/api/files';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
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

export interface ModelInfo {
  id: string;
  name?: string;
  description?: string;
}

export async function fetchProviderModels(profileId: string): Promise<ModelInfo[]> {
  const endpoint = `/api/providers/${encodeURIComponent(profileId)}/models`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export interface CreateProfileRequest {
  name: string;
  provider_kind: 'ollama' | 'openai' | 'anthropic' | 'openai_codex' | 'plugin';
  auth_method: 'apikey' | 'oauth' | 'none';
  default_model: string;
  base_url?: string;
  api_key?: string;
}

export interface UpdateProfileRequest {
  name: string;
  auth_method: 'apikey' | 'oauth' | 'none';
  default_model: string;
  base_url?: string;
  api_key?: string;
}

import type { ProviderProfile } from './types';

export async function fetchProfiles(): Promise<ProviderProfile[]> {
  const response = await fetch('/api/profiles');
  return parseJsonOrThrow(response, '/api/profiles');
}

export async function createProfile(payload: CreateProfileRequest): Promise<ProviderProfile> {
  const endpoint = '/api/profiles';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function updateProfile(
  id: string,
  payload: UpdateProfileRequest,
): Promise<ProviderProfile> {
  const endpoint = `/api/profiles/${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function deleteProfile(id: string): Promise<void> {
  const endpoint = `/api/profiles/${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, { method: 'DELETE' });
  await parseJsonOrThrow(response, endpoint);
}

export type StartCodexConnectResponse = {
  session_id: string;
  auth_url: string;
};

export type CompleteCodexConnectRequest = {
  session_id: string;
  redirect_url: string;
};

export async function startCodexConnect(profileId: string): Promise<StartCodexConnectResponse> {
  const endpoint = `/api/providers/${encodeURIComponent(profileId)}/connect-oauth/start`;
  const response = await fetch(endpoint, { method: 'POST' });
  return parseJsonOrThrow(response, endpoint);
}

export async function completeCodexConnect(
  profileId: string,
  payload: CompleteCodexConnectRequest,
): Promise<{ status: string }> {
  const endpoint = `/api/providers/${encodeURIComponent(profileId)}/connect-oauth/complete`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function deleteAgent(id: string): Promise<void> {
  const endpoint = `/api/agents/${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, { method: 'DELETE' });
  await parseJsonOrThrow(response, endpoint);
}

// ---------------------------------------------------------------------------
// Sandbox API — agent policy YAML + session audit log + approve/deny
// ---------------------------------------------------------------------------

/** Fetch the sandbox.yaml policy for an agent. Returns null if no policy configured (404). */
export async function getAgentSandbox(agentId: string): Promise<SandboxPolicy | null> {
  const endpoint = `/api/agents/${encodeURIComponent(agentId)}/sandbox`;
  const response = await fetch(endpoint);
  if (response.status === 404) return null;
  return parseJsonOrThrow(response, endpoint);
}

/** Write/replace the sandbox.yaml policy for an agent. */
export async function putAgentSandbox(agentId: string, policy: SandboxPolicy): Promise<void> {
  const endpoint = `/api/agents/${encodeURIComponent(agentId)}/sandbox`;
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(policy),
  });
  await parseJsonOrThrow(response, endpoint);
}

/** Hot-reload the network policy for an active session without restarting. */
export async function patchSessionNetworkPolicy(
  sessionId: string,
  networkPolicy: SandboxNetworkPolicy,
): Promise<void> {
  const endpoint = `/api/sessions/${encodeURIComponent(sessionId)}/sandbox/network`;
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(networkPolicy),
  });
  await parseJsonOrThrow(response, endpoint);
}

/** Fetch the audit log entries for a session. */
export async function getSessionAuditLog(sessionId: string): Promise<AuditEntry[]> {
  const endpoint = `/api/sessions/${encodeURIComponent(sessionId)}/audit-log`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

/** Approve a pending sandbox request (network block awaiting user decision). */
export async function approveSessionRequest(
  sessionId: string,
  requestId: string,
): Promise<void> {
  const endpoint = `/api/sessions/${encodeURIComponent(sessionId)}/sandbox/approve`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ request_id: requestId }),
  });
  await parseJsonOrThrow(response, endpoint);
}

/** Deny a pending sandbox request. */
export async function denySessionRequest(
  sessionId: string,
  requestId: string,
): Promise<void> {
  const endpoint = `/api/sessions/${encodeURIComponent(sessionId)}/sandbox/deny`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ request_id: requestId }),
  });
  await parseJsonOrThrow(response, endpoint);
}

// ---------------------------------------------------------------------------
// Sandbox MCP / process policy API
// ---------------------------------------------------------------------------

/** Fetch the list of configured MCP servers and their connection status. */
export async function fetchMcpStatus(): Promise<McpServerStatus[]> {
  const endpoint = '/api/mcp/status';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return Array.isArray(data) ? data : (data.items ?? []);
}

/** Hot-reload the MCP server policy for an active session without restarting. */
export async function patchSessionMcpPolicy(
  sessionId: string,
  mcpPolicy: SandboxMcpPolicy,
): Promise<void> {
  const endpoint = `/api/sessions/${encodeURIComponent(sessionId)}/sandbox/mcp`;
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(mcpPolicy),
  });
  await parseJsonOrThrow(response, endpoint);
}

/** Hot-reload the bash/process policy for an active session without restarting. */
export async function patchSessionBashPolicy(
  sessionId: string,
  processPolicy: SandboxProcessPolicy,
): Promise<void> {
  const endpoint = `/api/sessions/${encodeURIComponent(sessionId)}/sandbox/process`;
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(processPolicy),
  });
  await parseJsonOrThrow(response, endpoint);
}

// ---------------------------------------------------------------------------
// Knowledge graph API
// ---------------------------------------------------------------------------

export async function fetchKgStats(): Promise<GraphStats> {
  const endpoint = '/api/graph/stats';
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchKgFacts(q: string, limit = 20): Promise<GraphFact[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const endpoint = `/api/graph/facts?${params}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function fetchKgSearch(q: string, limit = 20): Promise<GraphEntity[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const endpoint = `/api/graph/search?${params}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function fetchKgNode(id: string, limit = 20): Promise<GraphNode> {
  const params = new URLSearchParams({ limit: String(limit) });
  const endpoint = `/api/graph/node/${encodeURIComponent(id)}?${params}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.item;
}

export async function triggerKgBackfill(): Promise<IngestStats> {
  const endpoint = '/api/graph/backfill';
  const response = await fetch(endpoint, { method: 'POST' });
  return parseJsonOrThrow(response, endpoint);
}

// ---------------------------------------------------------------------------
// Version update API
// ---------------------------------------------------------------------------

export type VersionCheckResponse = {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  is_critical: boolean;
  release_notes: string | null;
  release_url: string;
  skipped: boolean;
};

export type UpgradeResponse = {
  success: boolean;
  installed_version: string;
  cleanup_files: string[];
};

export async function fetchVersionCheck(): Promise<VersionCheckResponse> {
  const response = await fetch('/api/version/check');
  return parseJsonOrThrow(response, '/api/version/check');
}

export async function triggerUpgrade(): Promise<UpgradeResponse> {
  const response = await fetch('/api/version/upgrade', { method: 'POST' });
  return parseJsonOrThrow(response, '/api/version/upgrade');
}

export async function triggerRestart(): Promise<{ status: string }> {
  const response = await fetch('/api/version/restart', { method: 'POST' });
  return parseJsonOrThrow(response, '/api/version/restart');
}

export async function skipVersion(version: string): Promise<{ status: string; version: string }> {
  const response = await fetch('/api/version/skip', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  return parseJsonOrThrow(response, '/api/version/skip');
}
