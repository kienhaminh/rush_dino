import type { GraphSnapshot, ScoredSkill } from './skill-graph-types';

async function parseJsonOrThrow<T>(response: Response, endpoint: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`${endpoint} failed (${response.status}): ${text}`);
  }
  return response.json();
}

export async function fetchSkillGraph(): Promise<GraphSnapshot> {
  const endpoint = '/api/skill-graph';
  const response = await fetch(endpoint);
  return parseJsonOrThrow<GraphSnapshot>(response, endpoint);
}

export async function querySkillGraph(q: string, limit = 5): Promise<ScoredSkill[]> {
  const endpoint = `/api/skill-graph/query?q=${encodeURIComponent(q)}&limit=${limit}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow<{ items: ScoredSkill[] }>(response, endpoint);
  return data.items;
}
