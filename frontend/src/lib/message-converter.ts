import type { ConversationItem, Message, PendingInputRequest } from './types';

/**
 * Converts REST API Message[] (from GET /api/conversations/:id) into ConversationItem[]
 * for display in ConversationTimeline.
 *
 * Pairing strategy:
 * - assistant messages with tool_calls produce tool_use items (status: 'done')
 * - tool role messages are paired sequentially with the earliest preceding unresolved tool_use
 */
export function messagesToItems(
  messages: Message[],
  pendingInputRequests: PendingInputRequest[] = [],
): ConversationItem[] {
  const items: ConversationItem[] = [];
  // Indices of tool_use items that are still awaiting their result message
  const pendingToolUseIndices: number[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'user') {
      items.push({ kind: 'user', id: msg.id, content: msg.content });
      continue;
    }

    if (msg.role === 'assistant') {
      if (msg.content) {
        items.push({
          kind: 'assistant',
          id: msg.id,
          content: msg.content,
          richContent: msg.rich_content ?? null,
        });
      }
      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          const idx = items.length;
          pendingToolUseIndices.push(idx);
          items.push({
            kind: 'tool_use',
            id: `${msg.id}-${tc.id}`,
            tool_name: tc.name,
            args: tc.arguments as Record<string, unknown>,
            status: 'done',
          });
        }
      }
      continue;
    }

    if (msg.role === 'tool') {
      // Pair with the earliest unresolved tool_use by sequential ordering
      const idx = pendingToolUseIndices.shift();
      if (idx !== undefined) {
        const existing = items[idx];
        if (existing.kind === 'tool_use') {
          const isError = msg.content.startsWith('[tool_error:');
          items[idx] = {
            ...existing,
            result: msg.content,
            is_error: isError,
            status: isError ? 'error' : 'done',
          };
        }
      }
    }
  }

  const pendingRequestsQueue = [...pendingInputRequests];
  const requestByToolItemId = new Map<string, PendingInputRequest>();
  for (const idx of pendingToolUseIndices) {
    const item = items[idx];
    if (item?.kind !== 'tool_use' || item.tool_name !== 'request_user_input') continue;
    const request = pendingRequestsQueue.shift();
    if (!request) continue;
    requestByToolItemId.set(item.id, request);
    items[idx] = {
      ...item,
      status: 'running',
    };
  }

  if (!requestByToolItemId.size) {
    return items;
  }

  const hydrated: ConversationItem[] = [];
  for (const item of items) {
    hydrated.push(item);
    if (item.kind !== 'tool_use') continue;
    const request = requestByToolItemId.get(item.id);
    if (!request) continue;
    hydrated.push({
      kind: 'input_request',
      id: `input-${request.requestId}`,
      requestId: request.requestId,
      runId: request.runId ?? null,
      conversationId: request.conversationId,
      payload: request.payload,
      createdAt: request.createdAt,
      status: 'pending',
      values: null,
    });
  }

  return hydrated;
}

/** Format a date string as a relative or absolute label for conversation list items */
export function formatConversationTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
