export type UsageTotals = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  totalCost: number
  inputCost: number
  outputCost: number
  cacheReadCost: number
  cacheWriteCost: number
}

export type CostDailyEntry = {
  date: string
  input: number
  output: number
  totalTokens: number
  totalCost: number
  inputCost: number
  outputCost: number
}

export type SessionUsageEntry = {
  key: string
  label?: string
  model?: string
  modelProvider?: string
  updatedAt?: number
  usage?: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    totalTokens: number
    totalCost: number
    inputCost: number
    outputCost: number
    cacheReadCost: number
    cacheWriteCost: number
    firstActivity?: number
    lastActivity?: number
    durationMs?: number
    dailyBreakdown?: Array<{ date: string; tokens: number; cost: number }>
    modelUsage?: Array<{
      provider?: string
      model?: string
      count: number
      totals: Partial<UsageTotals>
    }>
  }
}

export type UsageAggregates = {
  byModel: Array<{ model?: string; provider?: string; count: number; totals: Partial<UsageTotals> }>
  byProvider: Array<{ provider?: string; count: number; totals: Partial<UsageTotals> }>
  daily: Array<{ date: string; tokens: number; cost: number }>
}

export type ChartMode = 'tokens' | 'cost'
export type SessionSort = 'tokens' | 'cost' | 'recent'
export type SortDir = 'asc' | 'desc'
