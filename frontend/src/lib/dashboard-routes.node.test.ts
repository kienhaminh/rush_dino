import { describe, expect, it } from 'vitest';

import {
  ADVANCED_VIEWS,
  CONFIG_SECTIONS,
  OPERATIONS_VIEWS,
  PRIMARY_NAV_ITEMS,
  resolveLegacyPath,
  resolvePageHeader,
} from './dashboard-routes';

describe('PRIMARY_NAV_ITEMS', () => {
  it('defines the simplified top-level navigation in the planned order', () => {
    expect(PRIMARY_NAV_ITEMS.map((item) => item.label)).toEqual([
      'Workspace',
      'Operations',
      'Channels',
      'Sessions',
      'Runs',
      'Config',
      'Builder',
      'System',
    ]);
  });
});

describe('dashboard route metadata', () => {
  it('defines the operations, config, and advanced subviews used by the router', () => {
    expect(OPERATIONS_VIEWS.map((item) => item.id)).toEqual([
      'summary',
      'approvals',
      'diagnostics',
      'analytics',
    ]);
    expect(CONFIG_SECTIONS.map((item) => item.id)).toEqual([
      'profiles',
      'credentials',
      'server',
      'identity',
    ]);
    expect(ADVANCED_VIEWS.map((item) => `${item.area}/${item.id}`)).toEqual([
      'builder/agents',
      'builder/agent-board',
      'builder/workflows',
      'builder/skills',
      'builder/coding-agents',
      'builder/acp-sessions',
      'system/logs',
      'system/cron',
      'system/nodes',
      'system/debug',
    ]);
  });

  it('maps concrete paths to their shell view metadata', () => {
    expect(resolvePageHeader('/')).toMatchObject({
      id: 'workspace',
      title: 'Workspace',
    });
    expect(resolvePageHeader('/operations/diagnostics')).toMatchObject({
      id: 'operations',
      title: 'Operations',
      detail: 'Diagnostics',
    });
    expect(resolvePageHeader('/channels/telegram')).toMatchObject({
      id: 'channels',
      title: 'Channels',
    });
    expect(resolvePageHeader('/system/logs')).toMatchObject({
      id: 'system',
      title: 'System',
      detail: 'Logs',
    });
    expect(resolvePageHeader('/builder/agents')).toMatchObject({
      id: 'builder',
      title: 'Builder',
      detail: 'Agents',
    });
    expect(resolvePageHeader('/builder')).toMatchObject({
      id: 'builder',
      title: 'Builder',
    });
  });
});

describe('resolveLegacyPath', () => {
  it('redirects old daily-ops routes into the merged operations hub', () => {
    expect(resolveLegacyPath('/overview')).toBe('/operations/summary');
    expect(resolveLegacyPath('/approvals')).toBe('/operations/approvals');
    expect(resolveLegacyPath('/diagnostics')).toBe('/operations/diagnostics');
    expect(resolveLegacyPath('/metrics')).toBe('/operations/analytics');
  });

  it('redirects old channel and config routes into their new homes', () => {
    expect(resolveLegacyPath('/gateway')).toBe('/channels');
    expect(resolveLegacyPath('/gateway/telegram/settings')).toBe(
      '/channels/telegram?panel=settings',
    );
    expect(resolveLegacyPath('/instances')).toBe('/channels?panel=instances');
    expect(resolveLegacyPath('/soul-memory')).toBe('/config/identity');
  });

  it('redirects builder and system routes directly to their new homes', () => {
    expect(resolveLegacyPath('/agents')).toBe('/builder/agents');
    expect(resolveLegacyPath('/agent-board')).toBe('/builder/agent-board');
    expect(resolveLegacyPath('/workflows')).toBe('/builder/workflows');
    expect(resolveLegacyPath('/skills')).toBe('/builder/skills');
    expect(resolveLegacyPath('/coding-agents')).toBe('/builder/coding-agents');
    expect(resolveLegacyPath('/acp-sessions')).toBe('/builder/acp-sessions');
    expect(resolveLegacyPath('/logs')).toBe('/system/logs');
    expect(resolveLegacyPath('/cron')).toBe('/system/cron');
    expect(resolveLegacyPath('/nodes')).toBe('/system/nodes');
    expect(resolveLegacyPath('/debug')).toBe('/system/debug');
  });

  it('returns null for non-legacy paths', () => {
    expect(resolveLegacyPath('/config/identity')).toBeNull();
    expect(resolveLegacyPath('/operations/summary')).toBeNull();
  });
});
