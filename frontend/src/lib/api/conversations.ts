// Conversations API — fetch, send, delete, and session reset.

import { parseJsonOrThrow } from './client';
import type {
  Conversation,
  ConversationDetail,
  SessionSummary,
  InputRequestStatus,
} from '../types';

function normalizeSessionSummary(session: SessionSummary): SessionSummary {
  return {
    ...session,
    contextWindow: session.contextWindow ?? {},
  };
}

export { normalizeSessionSummary };

export async function fetchConversations(): Promise<Conversation[]> {
  const response = await fetch('/api/conversations');
  const data = await parseJsonOrThrow(response, '/api/conversations');
  return data.items ?? [];
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  const response = await fetch(`/api/conversations/${id}`);
  const data = await parseJsonOrThrow(response, `/api/conversations/${id}`);
  return data;
}

export async function resolveInputRequest(
  requestId: string,
  payload:
    | { status: 'submitted'; values: Record<string, unknown> }
    | { status: 'cancelled' },
): Promise<{ requestId: string; status: InputRequestStatus }> {
  const endpoint = `/api/input-requests/${encodeURIComponent(requestId)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
}

export async function resetSession(id: string): Promise<void> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(id)}/reset`, { method: 'POST' });
  await parseJsonOrThrow(response, `/api/sessions/${id}/reset`);
}

export async function sendChat(conversationId: string | null, message: string) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, message }),
  });
  return parseJsonOrThrow(response, '/api/chat');
}
