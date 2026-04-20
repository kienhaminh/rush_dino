import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchMessages } from './api';

describe('messages API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('normalizes snake_case message payloads into the frontend model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'msg-1',
              from_agent: 'main',
              to_agent: 'writer',
              content: 'Please reply.',
              read: false,
              created_at: '2026-03-30T10:00:00Z',
              state: 'pending',
              reply_to_message_id: null,
              failure_reason: null,
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const messages = await fetchMessages({ agent: 'writer', unreadOnly: true });

    expect(fetchMock).toHaveBeenCalledWith('/api/messages?agent=writer&unread_only=true');
    expect(messages).toEqual([
      {
        id: 'msg-1',
        fromAgent: 'main',
        toAgent: 'writer',
        content: 'Please reply.',
        read: false,
        createdAt: '2026-03-30T10:00:00Z',
        state: 'pending',
        replyToMessageId: null,
        failureReason: null,
      },
    ]);
  });
});
