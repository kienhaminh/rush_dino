import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AgentOverview } from './AgentOverview';

describe('AgentOverview', () => {
  it('describes runtime model routing instead of per-agent model configuration', () => {
    const html = renderToStaticMarkup(
      createElement(AgentOverview, {
        agent: {
          id: 'artist-designer',
          name: 'Artist Designer',
          emoji: '🎨',
          isDefault: false,
          workspace: '/tmp/artist-designer.toml',
          description: 'Design specialist',
        },
      }),
    );

    expect(html).not.toContain('Primary Model');
    expect(html).not.toContain('Model Configuration');
    expect(html).toContain('Selected at runtime by the general agent');
  });
});
