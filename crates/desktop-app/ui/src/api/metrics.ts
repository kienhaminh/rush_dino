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
  items: UsageMetricRow[]
  aggregates: {
    totals: UsageTotals
    byProvider: Array<{ key: string; totals: UsageTotals }>
    byModel: Array<{ key: string; totals: UsageTotals }>
  }
  daily: Array<{ date: string; totals: UsageTotals }>
}

export type UsageMetricsFilters = {
  start?: string
  end?: string
}

export async function getUsageMetrics(
  filters: UsageMetricsFilters = {},
): Promise<UsageMetricsResponse> {
  const params = new URLSearchParams()
  if (filters.start) params.set('start', filters.start)
  if (filters.end) params.set('end', filters.end)
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const res = await apiFetch(`/api/usage/metrics${suffix}`)
  if (!res.ok) throw new Error(`usage/metrics: ${res.status}`)
  return (await res.json()) as UsageMetricsResponse
}
