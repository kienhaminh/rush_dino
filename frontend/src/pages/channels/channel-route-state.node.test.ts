import { describe, expect, it } from 'vitest';

import {
  buildChannelsPath,
  getValidChannelPanel,
  type ChannelPanel,
} from './channel-route-state';

describe('channel route state', () => {
  it('defaults invalid panels to overview', () => {
    expect(getValidChannelPanel(null)).toBe('overview');
    expect(getValidChannelPanel('bad-value')).toBe('overview');
  });

  it('accepts the supported panels', () => {
    for (const panel of ['overview', 'settings', 'instances'] satisfies ChannelPanel[]) {
      expect(getValidChannelPanel(panel)).toBe(panel);
    }
  });

  it('builds channel paths that preserve the selected panel', () => {
    expect(buildChannelsPath({ channel: null, panel: 'overview' })).toBe('/channels');
    expect(buildChannelsPath({ channel: null, panel: 'instances' })).toBe(
      '/channels?panel=instances',
    );
    expect(buildChannelsPath({ channel: 'telegram', panel: 'settings' })).toBe(
      '/channels/telegram?panel=settings',
    );
  });
});
