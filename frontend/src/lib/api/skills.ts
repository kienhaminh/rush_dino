// Skills API — list, upsert, delete skills, and mutate managed files.

import { parseJsonOrThrow } from './client';
import type { SkillRecord } from '../types';

export interface UpsertSkillRequest {
  name: string;
  description: string;
  instructions: string;
  tools?: string[];
}

export async function fetchSkills(): Promise<SkillRecord[]> {
  const endpoint = '/api/skills';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function upsertSkill(payload: UpsertSkillRequest): Promise<SkillRecord> {
  const endpoint = '/api/skills';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function deleteSkill(name: string): Promise<void> {
  const endpoint = `/api/skills/${encodeURIComponent(name)}`;
  const response = await fetch(endpoint, { method: 'DELETE' });
  await parseJsonOrThrow(response, endpoint);
}

export async function mutateManagedFile(payload: {
  action: 'create' | 'delete' | 'move';
  relative_path?: string;
  content?: string;
  from_path?: string;
  to_path?: string;
  dry_run?: boolean;
}): Promise<{
  action: string;
  dryRun: boolean;
  sourcePath: string;
  targetPath?: string | null;
  allowedRoot: string;
}> {
  const endpoint = '/api/files';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}
