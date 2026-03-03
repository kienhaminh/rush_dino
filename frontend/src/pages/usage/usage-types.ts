// Type definitions for the Usage page, mirroring openclaw's session usage data shape

export type UsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  missingCostEntries: number;
};

export type CostDailyEntry = {
  date: string; // YYYY-MM-DD
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost?: number;
  outputCost?: number;
  cacheReadCost?: number;
  cacheWriteCost?: number;
};

export type SessionUsageEntry = {
  key: string;
  label?: string;
  agentId?: string;
  channel?: string;
  model?: string;
  modelProvider?: string;
  providerOverride?: string;
  updatedAt?: number;
  usage?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    totalCost: number;
    inputCost?: number;
    outputCost?: number;
    cacheReadCost?: number;
    cacheWriteCost?: number;
    missingCostEntries?: number;
    firstActivity?: number;
    lastActivity?: number;
    durationMs?: number;
    activityDates?: string[];
    dailyBreakdown?: Array<{ date: string; tokens: number; cost: number }>;
    dailyMessageCounts?: Array<{
      date: string;
      total: number;
      toolCalls: number;
      errors: number;
    }>;
    messageCounts?: {
      total: number;
      user: number;
      assistant: number;
      toolCalls: number;
      toolResults: number;
      errors: number;
    };
    toolUsage?: {
      totalCalls: number;
      uniqueTools: number;
      tools: Array<{ name: string; count: number }>;
    };
    modelUsage?: Array<{
      provider?: string;
      model?: string;
      count: number;
      totals: Partial<UsageTotals>;
    }>;
    latency?: {
      count: number;
      avgMs: number;
      minMs: number;
      maxMs: number;
      p95Ms: number;
    };
    dailyLatency?: Array<{
      date: string;
      count: number;
      avgMs: number;
      minMs: number;
      maxMs: number;
      p95Ms: number;
    }>;
    dailyModelUsage?: Array<{
      date: string;
      provider?: string;
      model?: string;
      tokens: number;
      cost: number;
      count: number;
    }>;
  };
};

export type UsageAggregates = {
  messages: {
    total: number;
    user: number;
    assistant: number;
    toolCalls: number;
    toolResults: number;
    errors: number;
  };
  tools: {
    totalCalls: number;
    uniqueTools: number;
    tools: Array<{ name: string; count: number }>;
  };
  byModel: Array<{
    provider?: string;
    model?: string;
    count: number;
    totals: Partial<UsageTotals>;
  }>;
  byProvider: Array<{
    provider?: string;
    model?: string;
    count: number;
    totals: Partial<UsageTotals>;
  }>;
  byAgent: Array<{ agentId: string; totals: Partial<UsageTotals> }>;
  byChannel: Array<{ channel: string; totals: Partial<UsageTotals> }>;
  daily: Array<{
    date: string;
    tokens: number;
    cost: number;
    messages: number;
    toolCalls: number;
    errors: number;
  }>;
};

export type ChartMode = 'tokens' | 'cost';
export type DailyChartMode = 'total' | 'by-type';
export type SessionSort = 'tokens' | 'cost' | 'recent' | 'messages' | 'errors';
export type SortDir = 'asc' | 'desc';
export type TimeZone = 'local' | 'utc';
export type SessionsTab = 'all' | 'recent';
