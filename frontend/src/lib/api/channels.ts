// Channels API — pairing state, mobile gateway keys, and revocation.

import { parseJsonOrThrow } from './client';
import type { ChannelPairingState, MobileGatewayKeyRecord, IssuedMobileGatewayKey } from '../types';

export async function fetchChannelPairing(channel: string): Promise<ChannelPairingState> {
  const endpoint = `/api/channels/${encodeURIComponent(channel)}/pairing`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function resolveChannelPairingRequest(
  channel: string,
  requestId: string,
  approved: boolean,
): Promise<{ requestId: string; status: string }> {
  const endpoint = `/api/channels/${encodeURIComponent(channel)}/pairing/${encodeURIComponent(requestId)}/decision`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approved }),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function revokeChannelPairedUser(
  channel: string,
  senderId: string,
): Promise<{ channelId: string; senderId: string; revoked: boolean }> {
  const endpoint = `/api/channels/${encodeURIComponent(channel)}/pairing/paired/${encodeURIComponent(senderId)}`;
  const response = await fetch(endpoint, {
    method: 'DELETE',
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchMobileGatewayKeys(): Promise<MobileGatewayKeyRecord[]> {
  const endpoint = '/api/channels/mobile/keys';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function issueMobileGatewayKey(payload: {
  label?: string;
}): Promise<IssuedMobileGatewayKey> {
  const endpoint = '/api/channels/mobile/keys';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function revokeMobileGatewayKey(
  id: string,
): Promise<{ id: string; revoked: boolean }> {
  const endpoint = `/api/channels/mobile/keys/${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, { method: 'DELETE' });
  return parseJsonOrThrow(response, endpoint);
}
