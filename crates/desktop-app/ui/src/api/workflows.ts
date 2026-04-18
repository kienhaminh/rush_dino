import { apiFetch } from './bootstrap'

export type WorkflowSummary = {
  id: string
  name: string
  description?: string
  status?: string
  step_count?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export async function listWorkflows(): Promise<WorkflowSummary[]> {
  const res = await apiFetch('/api/workflows')
  if (!res.ok) throw new Error(`workflows: ${res.status}`)
  const body = (await res.json()) as { items?: WorkflowSummary[] }
  return body.items ?? []
}
