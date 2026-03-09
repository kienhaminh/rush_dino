import type { Message, ConversationItem } from './types';

/**
 * Converts REST API Message[] (from GET /api/conversations/:id) into ConversationItem[]
 * for display in ConversationTimeline.
 *
 * Pairing strategy:
 * - assistant messages with tool_calls produce tool_use items (status: 'done')
 * - tool role messages are paired sequentially with the earliest preceding unresolved tool_use
 */
export function messagesToItems(messages: Message[]): ConversationItem[] {
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
          items[idx] = {
            ...existing,
            result: msg.content,
            is_error: false,
            status: 'done',
          };
        }
      }
    }
  }

  return items;
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
