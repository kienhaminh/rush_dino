import { describe, expect, it } from 'vitest';

import {
  buildSessionsPath,
  getValidSessionTab,
  SESSION_TABS,
  type SessionTab,
} from './session-route-state';

describe('session route state', () => {
  it('lists the supported session tabs in the intended order', () => {
    expect(SESSION_TABS.map((tab) => tab.id)).toEqual([
      'overview',
      'prompts',
      'context',
      'runs',
      'tools',
    ]);
  });

  it('defaults invalid or missing tab values to overview', () => {
    expect(getValidSessionTab(null)).toBe('overview');
    expect(getValidSessionTab('bad-value')).toBe('overview');
  });

  it('accepts supported tab values', () => {
    for (const tab of ['overview', 'prompts', 'context', 'runs', 'tools'] satisfies SessionTab[]) {
      expect(getValidSessionTab(tab)).toBe(tab);
    }
  });

  it('builds session detail paths with stable tab query params', () => {
    expect(buildSessionsPath({ sessionId: 'session-1', tab: 'overview' })).toBe(
      '/sessions/session-1?tab=overview',
    );
    expect(buildSessionsPath({ sessionId: 'session-1', tab: 'tools' })).toBe(
      '/sessions/session-1?tab=tools',
    );
    expect(buildSessionsPath({ sessionId: null, tab: 'overview' })).toBe('/sessions?tab=overview');
  });
});
