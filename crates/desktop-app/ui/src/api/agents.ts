import { apiFetch } from './bootstrap'

export type AgentListItem = {
  id: string
  name: string
  emoji: string
  isDefault?: boolean
  workspace?: string
  description?: string
  sandboxPolicy?: unknown
  claimTags?: string[]
  claimsTasks?: boolean
  tools?: string | null
}

export async function listAgents(): Promise<AgentListItem[]> {
  const res = await apiFetch('/api/agents')
  if (!res.ok) throw new Error(`agents: ${res.status}`)
  const body = await res.json()
  if (Array.isArray(body)) return body as AgentListItem[]
  if (body && typeof body === 'object' && 'items' in body) {
    return (body.items as AgentListItem[]) ?? []
  }
  return []
}
