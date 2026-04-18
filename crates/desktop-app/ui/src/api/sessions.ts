import { apiFetch } from './bootstrap'

export type AgentSession = {
  id: string
  agent_id?: string
  channel?: string
  created_at?: string
  updated_at?: string
  status?: string
  title?: string
  [key: string]: unknown
}

export async function listAgentSessions(): Promise<AgentSession[]> {
  const res = await apiFetch('/api/agent-sessions')
  if (!res.ok) throw new Error(`agent-sessions: ${res.status}`)
  const body = await res.json()
  if (Array.isArray(body)) return body as AgentSession[]
  if (body && typeof body === 'object' && 'items' in body) {
    return (body.items as AgentSession[]) ?? []
  }
  return []
}
