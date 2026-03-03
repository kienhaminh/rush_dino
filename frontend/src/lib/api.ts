import type { AppConfigView, Conversation, CredentialsView, Message } from './types';

export async function fetchConversations(): Promise<Conversation[]> {
  const response = await fetch('/api/conversations');
  const data = await response.json();
  return data.items ?? [];
}

export async function fetchConversation(id: string): Promise<{ id: string; messages: Message[] }> {
  const response = await fetch(`/api/conversations/${id}`);
  return response.json();
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
}

export async function sendChat(conversationId: string | null, message: string) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, message }),
  });
  return response.json();
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
