import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';

import { GatewayPage } from './GatewayPage';

describe('GatewayPage', () => {
  it('renders simplified channel cards without a separate infrastructure section', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <GatewayPage
          summary={{
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
                  linkButtons: 'degraded',
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
            channelActivity: [
              {
                channelId: 'telegram',
                sessionCount: 2,
                recentRunCount: 3,
                activeRunCount: 1,
                blockedRunCount: 0,
              },
            ],
            recentFailures: [],
          }}
          gatewaySessions={[]}
          channelSnapshot={{
            channelMeta: [],
            channelAccounts: {},
            channels: {
              telegram: {
                configured: true,
                running: true,
                connected: true,
                lastStartAt: '2026-03-16T00:00:00Z',
                lastProbeAt: '2026-03-16T00:00:00Z',
                mode: 'polling',
                pairedCount: 0,
                pendingPairingCount: 0,
              },
            },
          }}
          infrastructure={[
            {
              channelId: 'telegram',
              status: 'connected',
              lastEventAt: '2026-03-16T00:00:00Z',
              lastError: null,
              reconnectCount: 1,
              sessionCount: 2,
              activeLastHour: 2,
              mostRecentSessionAt: '2026-03-16T00:10:00Z',
              capabilities: {
                plainText: true,
                markdown: true,
                codeBlocks: true,
                images: 'native',
                linkButtons: 'degraded',
              },
            },
          ]}
          loading={false}
          error={null}
          restartingChannelId={null}
          onRefresh={() => undefined}
          onRestart={() => undefined}
          onChannelToggle={() => undefined}
          onOpenChannelConfig={() => undefined}
          onResetGatewaySession={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('telegram');
    expect(html).toContain('Sessions');
    expect(html).toContain('Runs');
    expect(html).toContain('Last event');
    expect(html).not.toContain('Infrastructure');
    expect(html).not.toContain('Configured');
    expect(html).not.toContain('Reconnects');
    expect(html).not.toContain('role="tablist"');
  });
});
