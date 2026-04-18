import { apiFetch } from './bootstrap'

export type UsageTotals = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  rowCount: number
}

export type UsageMetricRow = {
  id: string
  conversationId: string
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  createdAt: string
}

export type UsageMetricsResponse = {
  rows?: UsageMetricRow[]
  items?: UsageMetricRow[]
  totals?: UsageTotals
  byProvider?: Array<{ key: string; totals: UsageTotals }>
  byModel?: Array<{ key: string; totals: UsageTotals }>
  byDay?: Array<{ key: string; totals: UsageTotals }>
  [key: string]: unknown
}

export async function getUsageMetrics(): Promise<UsageMetricsResponse> {
  const res = await apiFetch('/api/usage/metrics')
  if (!res.ok) throw new Error(`usage/metrics: ${res.status}`)
  return (await res.json()) as UsageMetricsResponse
}
