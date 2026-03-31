export interface UsageMetricRow {
  id: string;
  conversationId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  createdAt: string;
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  rowCount: number;
}

export interface UsageAggregateKey {
  key: string;
  totals: UsageTotals;
}

export interface DailyUsageEntry {
  date: string;
  totals: UsageTotals;
}

export interface UsageMetricsResponse {
  items: UsageMetricRow[];
  aggregates: {
    totals: UsageTotals;
    byProvider: UsageAggregateKey[];
    byModel: UsageAggregateKey[];
  };
  daily: DailyUsageEntry[];
}

export interface ConversationMetrics {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  limitTokens: number | null;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  responseTimeMs: number | null;
  measuredAt: string;
}
