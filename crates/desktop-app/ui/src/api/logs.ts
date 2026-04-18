import { apiFetch } from './bootstrap'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | string

export type RuntimeLogView = {
  id: string
  level: LogLevel
  target: string
  message: string
  fields?: unknown
  createdAt: string
}

export type LogsResponse = {
  items: RuntimeLogView[]
  nextCursor?: string
}

export type LogsQuery = {
  level?: LogLevel
  q?: string
  limit?: number
  cursor?: string
}

export async function getLogs(q: LogsQuery = {}): Promise<LogsResponse> {
  const params = new URLSearchParams()
  if (q.level) params.set('level', q.level)
  if (q.q) params.set('q', q.q)
  if (q.limit !== undefined) params.set('limit', String(q.limit))
  if (q.cursor) params.set('cursor', q.cursor)
  const qs = params.toString()
  const res = await apiFetch(`/api/logs${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`logs: ${res.status}`)
  return (await res.json()) as LogsResponse
}
