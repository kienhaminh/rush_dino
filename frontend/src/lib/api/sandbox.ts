// Sandbox API — agent policy YAML, session audit log, approve/deny, MCP and bash policies.

import { parseJsonOrThrow } from './client';
import type {
  AuditEntry,
  McpServerStatus,
  SandboxMcpPolicy,
  SandboxNetworkPolicy,
  SandboxPolicy,
  SandboxProcessPolicy,
} from '../types';

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
