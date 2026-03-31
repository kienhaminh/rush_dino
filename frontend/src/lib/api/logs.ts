// Logs API — fetch server logs with optional filtering.

import { parseJsonOrThrow } from './client';
import type { FetchLogsResponse } from '../types';

export async function fetchLogs(params?: {
  level?: string[];
  q?: string;
  limit?: number;
  cursor?: string;
}): Promise<FetchLogsResponse> {
  const query = new URLSearchParams();
  if (params?.level?.length) {
    query.set('level', params.level.join(','));
  }
  if (params?.q) {
    query.set('q', params.q);
  }
  if (params?.limit != null) {
    query.set('limit', String(params.limit));
  }
  if (params?.cursor) {
    query.set('cursor', params.cursor);
  }
  const endpoint = `/api/logs${query.size ? `?${query.toString()}` : ''}`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}
