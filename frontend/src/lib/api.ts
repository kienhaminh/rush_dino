import type { Conversation, Message } from './types';

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
