// Version API — check for updates, trigger upgrade/restart, and skip a version.

import { parseJsonOrThrow } from './client';

export type VersionCheckResponse = {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  is_critical: boolean;
  release_notes: string | null;
  release_url: string;
  skipped: boolean;
};

export type UpgradeResponse = {
  success: boolean;
  installed_version: string;
  cleanup_files: string[];
};

export async function fetchVersionCheck(): Promise<VersionCheckResponse> {
  const response = await fetch('/api/version/check');
  return parseJsonOrThrow(response, '/api/version/check');
}

export async function triggerUpgrade(): Promise<UpgradeResponse> {
  const response = await fetch('/api/version/upgrade', { method: 'POST' });
  return parseJsonOrThrow(response, '/api/version/upgrade');
}

export async function triggerRestart(): Promise<{ status: string }> {
  const response = await fetch('/api/version/restart', { method: 'POST' });
  return parseJsonOrThrow(response, '/api/version/restart');
}

export async function skipVersion(version: string): Promise<{ status: string; version: string }> {
  const response = await fetch('/api/version/skip', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  return parseJsonOrThrow(response, '/api/version/skip');
}
