// Provider profiles API — CRUD for profiles and OAuth connect flow.

import { parseJsonOrThrow } from './client';
import type { ProviderProfile } from '../types';

export interface ModelInfo {
  id: string;
  name?: string;
  description?: string;
}

export interface CreateProfileRequest {
  name: string;
  provider_kind: 'ollama' | 'openai' | 'anthropic' | 'openai_codex' | 'plugin';
  auth_method: 'apikey' | 'oauth' | 'none';
  default_model: string;
  base_url?: string;
  api_key?: string;
}

export interface UpdateProfileRequest {
  name: string;
  auth_method: 'apikey' | 'oauth' | 'none';
  default_model: string;
  base_url?: string;
  api_key?: string;
}

export type StartOAuthConnectResponse = {
  session_id: string;
  auth_url: string;
};

export type CompleteOAuthConnectRequest = {
  session_id: string;
  redirect_url: string;
};

export async function fetchProfiles(): Promise<ProviderProfile[]> {
  const response = await fetch('/api/profiles');
  return parseJsonOrThrow(response, '/api/profiles');
}

export async function createProfile(payload: CreateProfileRequest): Promise<ProviderProfile> {
  const endpoint = '/api/profiles';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function updateProfile(
  id: string,
  payload: UpdateProfileRequest,
): Promise<ProviderProfile> {
  const endpoint = `/api/profiles/${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function deleteProfile(id: string): Promise<void> {
  const endpoint = `/api/profiles/${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, { method: 'DELETE' });
  await parseJsonOrThrow(response, endpoint);
}

export async function fetchProviderModels(profileId: string): Promise<ModelInfo[]> {
  const endpoint = `/api/providers/${encodeURIComponent(profileId)}/models`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function startOAuthConnect(profileId: string): Promise<StartOAuthConnectResponse> {
  const endpoint = `/api/providers/${encodeURIComponent(profileId)}/connect-oauth/start`;
  const response = await fetch(endpoint, { method: 'POST' });
  return parseJsonOrThrow(response, endpoint);
}

export async function completeOAuthConnect(
  profileId: string,
  payload: CompleteOAuthConnectRequest,
): Promise<{ status: string }> {
  const endpoint = `/api/providers/${encodeURIComponent(profileId)}/connect-oauth/complete`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}
