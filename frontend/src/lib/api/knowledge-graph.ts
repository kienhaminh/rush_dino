// Knowledge graph API — stats, facts, entity search, node detail, and backfill trigger.

import { parseJsonOrThrow } from './client';
import type { GraphStats, GraphFact, GraphEntity, GraphNode, IngestStats } from '../types';

export async function fetchKgStats(): Promise<GraphStats> {
  const endpoint = '/api/graph/stats';
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchKgFacts(q: string, limit = 20): Promise<GraphFact[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const endpoint = `/api/graph/facts?${params}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function fetchKgSearch(q: string, limit = 20): Promise<GraphEntity[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const endpoint = `/api/graph/search?${params}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function fetchKgNode(id: string, limit = 20): Promise<GraphNode> {
  const params = new URLSearchParams({ limit: String(limit) });
  const endpoint = `/api/graph/node/${encodeURIComponent(id)}?${params}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.item;
}

export async function triggerKgBackfill(): Promise<IngestStats> {
  const endpoint = '/api/graph/backfill';
  const response = await fetch(endpoint, { method: 'POST' });
  return parseJsonOrThrow(response, endpoint);
}
