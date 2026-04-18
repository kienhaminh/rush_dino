import { apiFetch } from './bootstrap'

export type CronJob = {
  id: string
  name?: string
  schedule?: string
  agent_id?: string
  enabled?: boolean
  status?: string
  last_run_at?: string
  next_run_at?: string
  [key: string]: unknown
}

export async function listCronJobs(): Promise<CronJob[]> {
  const res = await apiFetch('/api/cron')
  if (!res.ok) throw new Error(`cron: ${res.status}`)
  const body = (await res.json()) as { items?: CronJob[] }
  return body.items ?? []
}

export async function pauseCronJob(id: string): Promise<CronJob> {
  const res = await apiFetch(`/api/cron/${encodeURIComponent(id)}/pause`, { method: 'POST' })
  if (!res.ok) throw new Error(`cron.pause: ${res.status}`)
  return (await res.json()) as CronJob
}

export async function resumeCronJob(id: string): Promise<CronJob> {
  const res = await apiFetch(`/api/cron/${encodeURIComponent(id)}/resume`, { method: 'POST' })
  if (!res.ok) throw new Error(`cron.resume: ${res.status}`)
  return (await res.json()) as CronJob
}

export async function runCronJobNow(id: string): Promise<void> {
  const res = await apiFetch(`/api/cron/${encodeURIComponent(id)}/run`, { method: 'POST' })
  if (!res.ok) throw new Error(`cron.run: ${res.status}`)
}
