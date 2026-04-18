import { apiFetch } from './bootstrap'

/* ── Agent runtime ──────────────────────────────────────────────────────
 * Mirrors `AgentRuntimeResponse` from
 * crates/server/src/routes/agents.rs (camelCase via serde rename).
 */

export type AgentFileRecord = {
  name: string
  path: string
  size: string
  updatedAt: string
  missing: boolean
  content: string
}

export type AgentToolRecord = {
  id: string
  [key: string]: unknown
}

export type AgentToolSection = {
  id?: string
  name?: string
  tools?: AgentToolRecord[]
  [key: string]: unknown
}

export type AgentSkillRecord = {
  name: string
  description?: string
  instructions?: string
  tools?: string[]
  [key: string]: unknown
}

export type AgentChannelRecord = {
  channelId?: string
  id?: string
  status?: string
  [key: string]: unknown
}

export type AgentCronJob = {
  id: string
  name?: string
  schedule?: string
  enabled?: boolean
  status?: string
  [key: string]: unknown
}

export type AgentCronStatus = {
  enabled?: boolean
  running?: number
  [key: string]: unknown
}

export type AgentRuntimeResponse = {
  files: AgentFileRecord[]
  toolsProfile: string
  toolSections: AgentToolSection[]
  skills: AgentSkillRecord[]
  channels: AgentChannelRecord[]
  cronStatus: AgentCronStatus
  cronJobs: AgentCronJob[]
}

export async function getAgentRuntime(agentId: string): Promise<AgentRuntimeResponse> {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/runtime`)
  if (!res.ok) throw new Error(`agent-runtime: ${res.status}`)
  return (await res.json()) as AgentRuntimeResponse
}

/* ── Session runs (a.k.a. runs within a conversation) ─────────────────── */

export type RunState =
  | 'Running'
  | 'AwaitingApproval'
  | 'AwaitingInput'
  | 'Completed'
  | 'Failed'
  | 'Cancelled'
  | string

export type RunSummary = {
  id: string
  state: RunState
  conversationId?: string
  sessionId?: string
  agentId?: string
  createdAt?: string
  updatedAt?: string
  startedAt?: string
  completedAt?: string
  error?: string | null
  summary?: string | null
  toolName?: string | null
  [key: string]: unknown
}

/**
 * Calls `GET /api/sessions/:id/runs`. Server uses "session" and
 * "conversation" interchangeably for the chat's run stream — pass the
 * conversation id you already have in Chat.tsx.
 */
export async function listSessionRuns(
  conversationId: string,
  limit = 12,
): Promise<RunSummary[]> {
  const qs = new URLSearchParams({ limit: String(limit) })
  const res = await apiFetch(
    `/api/sessions/${encodeURIComponent(conversationId)}/runs?${qs.toString()}`,
  )
  if (!res.ok) throw new Error(`session-runs: ${res.status}`)
  const body = await res.json()
  if (Array.isArray(body)) return body as RunSummary[]
  if (body && typeof body === 'object' && 'items' in body) {
    return (body.items as RunSummary[]) ?? []
  }
  return []
}

export async function abortRun(runId: string): Promise<void> {
  const res = await apiFetch(`/api/runs/${encodeURIComponent(runId)}/abort`, {
    method: 'POST',
  })
  if (!res.ok && res.status !== 404) throw new Error(`run.abort: ${res.status}`)
}
