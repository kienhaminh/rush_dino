// Usage API — fetch token/cost metrics with optional filters.

import { parseJsonOrThrow } from './client';
import type { UsageMetricsResponse } from '../types';

export async function fetchUsageMetrics(params?: {
  start?: string;
  end?: string;
  provider?: string;
  model?: string;
  conversationId?: string;
  limit?: number;
}): Promise<UsageMetricsResponse> {
  const query = new URLSearchParams();
  if (params?.start) query.set('start', params.start);
  if (params?.end) query.set('end', params.end);
  if (params?.provider) query.set('provider', params.provider);
  if (params?.model) query.set('model', params.model);
  if (params?.conversationId) query.set('conversation_id', params.conversationId);
  if (params?.limit != null) query.set('limit', String(params.limit));
  const endpoint = `/api/usage/metrics${query.size ? `?${query.toString()}` : ''}`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}
