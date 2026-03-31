// Configuration API — system prompt, tools, app config, credentials, and thinking level.

import { parseJsonOrThrow } from './client';
import type { AppConfigView, CredentialsView, RegisteredTool } from '../types';

export async function fetchSystemPrompt(): Promise<{ content: string; tokenEstimate: number }> {
  const endpoint = '/api/system/prompt';
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchRegisteredTools(): Promise<RegisteredTool[]> {
  const endpoint = '/api/system/tools';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.tools;
}

export async function fetchConfig(): Promise<AppConfigView> {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error(`Failed to fetch config: ${response.statusText}`);
  return response.json();
}

export async function patchConfig(patch: Partial<AppConfigView>): Promise<AppConfigView> {
  const response = await fetch('/api/config', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Failed to save config: ${response.statusText}`);
  return response.json();
}

export async function fetchCredentials(): Promise<CredentialsView> {
  const response = await fetch('/api/credentials');
  if (!response.ok) throw new Error(`Failed to fetch credentials: ${response.statusText}`);
  return response.json();
}

export async function patchCredentials(patch: Partial<CredentialsView>): Promise<CredentialsView> {
  const response = await fetch('/api/credentials', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Failed to save credentials: ${response.statusText}`);
  return response.json();
}

export async function patchThinkingLevel(level: string): Promise<void> {
  const endpoint = '/api/system/thinking-level';
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  });
  await parseJsonOrThrow(response, endpoint);
}
