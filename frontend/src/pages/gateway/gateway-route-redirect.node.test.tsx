import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  const React = await import('react');

  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ channel: 'telegram' }),
    Navigate: ({ to }: { to: string }) =>
      React.createElement('div', { 'data-testid': 'redirect', 'data-to': to }),
  };
});

import { GatewayRoute } from './GatewayRoute';

describe('GatewayRoute', () => {
  it('redirects channel detail routes back to /gateway', () => {
    const html = renderToStaticMarkup(<GatewayRoute />);

    expect(html).toContain('data-testid="redirect"');
    expect(html).toContain('data-to="/gateway"');
  });
});
