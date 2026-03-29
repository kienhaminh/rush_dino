import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';

import { GatewayPage } from './GatewayPage';

describe('GatewayPage', () => {
  it('renders a read-only gateway status grid without a duplicate in-page title', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <GatewayPage
          channels={[
            {
              channel: 'telegram',
              label: 'Telegram',
              connected: true,
              configured: true,
              lastActivityAt: '2026-03-16T00:00:00Z',
              issue: null,
            },
            {
              channel: 'slack',
              label: 'Slack',
              connected: false,
              configured: false,
              lastActivityAt: null,
              issue: 'Missing credentials',
            },
          ]}
          loading={false}
          error={null}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('Open Workspace');
    expect(html).not.toContain('Read-only status');
    expect(html).not.toContain('<h1');
    expect(html).toContain('Telegram');
    expect(html).toContain('Slack');
    expect(html).toContain('Connected');
    expect(html).toContain('Offline');
    expect(html).toContain('Configured');
    expect(html).toContain('Not configured');
    expect(html).toContain('Last activity');
    expect(html).toContain('No activity yet');
    expect(html).toContain('Missing credentials');

    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('Gateway sessions');
    expect(html).not.toContain('Recent failure signals');
    expect(html).not.toContain('Per-channel load');
    expect(html).not.toContain('Restart');
    expect(html).not.toContain('Open detail');
    expect(html).not.toContain('Enable');
    expect(html).not.toContain('Disable');
  });
});
