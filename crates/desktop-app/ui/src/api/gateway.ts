import { apiFetch } from './bootstrap'

export type GatewayAdapterStatus = 'idle' | 'running' | 'reconnecting' | 'failed' | string

export type GatewayAdapter = {
  channelId: string
  status: GatewayAdapterStatus
  lastEventAt?: string | null
  lastError?: string | null
  reconnectCount?: number
  capabilities?: unknown
}

export type GatewayAdaptersResponse = { items: GatewayAdapter[] }

export async function listAdapters(): Promise<GatewayAdapter[]> {
  const res = await apiFetch('/api/gateway/adapters')
  if (!res.ok) throw new Error(`gateway.adapters: ${res.status}`)
  const body = (await res.json()) as GatewayAdaptersResponse
  return body.items ?? []
}

export async function restartAdapter(channel: string): Promise<void> {
  const res = await apiFetch(
    `/api/gateway/adapters/${encodeURIComponent(channel)}/restart`,
    { method: 'POST' },
  )
  if (!res.ok) throw new Error(`gateway.restart: ${res.status}`)
}
