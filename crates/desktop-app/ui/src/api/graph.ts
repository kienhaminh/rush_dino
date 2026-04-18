import { apiFetch } from './bootstrap'

export type GraphFact = {
  subject: string
  predicate: string
  object: string
  confidence?: number
  support_count?: number
  evidence?: string[]
}

export type GraphStats = {
  sources?: number
  entities?: number
  relations?: number
  evidence?: number
  [key: string]: number | undefined
}

export async function getStats(): Promise<GraphStats> {
  const res = await apiFetch('/api/graph/stats')
  if (!res.ok) throw new Error(`graph.stats: ${res.status}`)
  return (await res.json()) as GraphStats
}

export async function searchFacts(q: string, limit = 30): Promise<GraphFact[]> {
  const qs = new URLSearchParams({ q, limit: String(limit) })
  const res = await apiFetch(`/api/graph/facts?${qs.toString()}`)
  if (!res.ok) throw new Error(`graph.facts: ${res.status}`)
  const body = (await res.json()) as { items?: GraphFact[] }
  return body.items ?? []
}

export async function triggerBackfill(): Promise<GraphStats> {
  const res = await apiFetch('/api/graph/backfill', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) throw new Error(`graph.backfill: ${res.status}`)
  return (await res.json()) as GraphStats
}
