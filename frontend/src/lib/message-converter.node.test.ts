import { describe, expect, it } from 'vitest';

import { messagesToItems } from './message-converter';
import type { Message, PendingInputRequest } from './types';

describe('messagesToItems', () => {
  it('rehydrates pending request_user_input calls as running input request items', () => {
    const messages: Message[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        created_at: '2026-03-29T12:00:00Z',
        tool_calls: [
          {
            id: 'call-1',
            name: 'request_user_input',
            arguments: { kind: 'question' },
          },
        ],
      },
    ];
    const pendingInputRequests: PendingInputRequest[] = [
      {
        requestId: 'request-1',
        sessionId: 'session-1',
        conversationId: 'main',
        runId: 'run-1',
        createdAt: '2026-03-29T12:00:01Z',
        payload: {
          spec: {
            kind: 'question',
            title: 'Which surface?',
            fields: [
              {
                name: 'surface',
                label: 'Surface',
                type: 'select',
                required: true,
                options: [
                  { label: 'Web', value: 'web' },
                  { label: 'Mobile Gateway', value: 'mobile-gateway' },
                ],
              },
            ],
          },
        },
      },
    ];

    const items = messagesToItems(messages, pendingInputRequests);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: 'tool_use',
      tool_name: 'request_user_input',
      status: 'running',
    });
    expect(items[1]).toMatchObject({
      kind: 'input_request',
      requestId: 'request-1',
      status: 'pending',
    });
  });
});
