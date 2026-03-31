// Soul memory API — fetch state and patch individual memory files.

import { parseJsonOrThrow } from './client';
import type { SoulMemoryStateResponse, SoulMemoryFile } from '../types';

export async function fetchSoulMemoryState(): Promise<SoulMemoryStateResponse> {
  const endpoint = '/api/system/soul-memory';
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function patchSoulMemoryFile(filename: string, content: string): Promise<SoulMemoryFile> {
  const endpoint = '/api/system/soul-memory/file';
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename, content }),
  });
  return parseJsonOrThrow(response, endpoint);
}
