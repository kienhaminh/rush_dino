import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { InstancesPage } from './InstancesPage';

describe('InstancesPage', () => {
  it('renders infrastructure adapter activity instead of an empty placeholder model', () => {
    const html = renderToStaticMarkup(
      <InstancesPage
        loading={false}
        entries={[
          {
            channelId: 'telegram',
            status: 'connected',
            lastEventAt: '2026-03-16T00:00:00Z',
            lastError: null,
            reconnectCount: 2,
            sessionCount: 4,
            activeLastHour: 3,
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
        lastError={null}
        statusMessage={null}
        onRefresh={() => undefined}
      />,
    );

    expect(html).toContain('telegram');
    expect(html).toContain('connected');
    expect(html).toContain('4 sessions');
    expect(html).toContain('3 active last hour');
  });
});
