import { describe, expect, it } from 'vitest';

import type { GatewaySummaryResponse, SystemSummaryResponse } from '@/lib/types';
import { buildGatewayChannels } from './GatewayRoute';

describe('buildGatewayChannels', () => {
  it('merges configured state from system summary and activity from gateway summary', () => {
    const channels = buildGatewayChannels(
      {
        channels: [
          {
            id: 'telegram',
            label: 'Telegram',
            enabled: true,
            configured: true,
            status: 'healthy',
            issue: null,
          },
          {
            id: 'slack',
            label: 'Slack',
            enabled: false,
            configured: false,
            status: 'needs_attention',
            issue: 'Missing credentials',
          },
        ],
      } as SystemSummaryResponse,
      {
        generatedAt: '2026-03-16T00:00:00Z',
        adapters: [
          {
            channelId: 'telegram',
            status: 'connected',
            lastEventAt: '2026-03-16T00:00:00Z',
            lastError: null,
            reconnectCount: 1,
            capabilities: {
              plainText: true,
              markdown: true,
              codeBlocks: true,
              images: 'native',
              linkButtons: 'native',
            },
          },
        ],
        sessions: {
          totalCount: 0,
          activeLastHour: 0,
          mostRecentId: null,
          mostRecentAt: null,
        },
        runs: {
          totalCount: 0,
          activeCount: 0,
          blockedCount: 0,
          failedCount: 0,
          mostRecentId: null,
        },
        channelActivity: [],
        recentFailures: [],
      } as GatewaySummaryResponse,
    );

    expect(channels.map((channel) => channel.channel)).toEqual([
      'whatsapp',
      'telegram',
      'discord',
      'googlechat',
      'slack',
      'signal',
      'imessage',
      'nostr',
    ]);

    expect(channels.find((channel) => channel.channel === 'telegram')).toMatchObject({
      label: 'Telegram',
      connected: true,
      configured: true,
      lastActivityAt: '2026-03-16T00:00:00Z',
      issue: null,
    });

    expect(channels.find((channel) => channel.channel === 'slack')).toMatchObject({
      label: 'Slack',
      connected: false,
      configured: false,
      lastActivityAt: null,
      issue: 'Missing credentials',
    });
  });
});
