import { describe, expect, it } from 'vitest';

import {
  ADVANCED_VIEWS,
  CONFIG_SECTIONS,
  OPERATIONS_VIEWS,
  PRIMARY_NAV_ITEMS,
  resolvePageHeader,
} from './dashboard-routes';

describe('PRIMARY_NAV_ITEMS', () => {
  it('defines the top-level navigation', () => {
    expect(PRIMARY_NAV_ITEMS.map((item) => item.label)).toEqual([
      'Workspace',
      'Operations',
      'Gateway',
      'Sessions',
      'Config',
      'System',
    ]);
  });
});

describe('dashboard route metadata', () => {
  it('defines operations, config, and advanced subviews', () => {
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
    expect(ADVANCED_VIEWS.map((item) => item.id)).toEqual([
      'agents',
      'kanban',
      'workflows',
      'skills',
      'coding-agents',
      'acp-sessions',
      'logs',
      'cron',
      'nodes',
      'debug',
    ]);
  });

  it('maps concrete paths to their shell view metadata', () => {
    expect(resolvePageHeader('/')).toMatchObject({ id: 'workspace', title: 'Workspace' });
    expect(resolvePageHeader('/approvals')).toMatchObject({ id: 'operations', title: 'Approvals' });
    expect(resolvePageHeader('/gateway')).toMatchObject({ id: 'channels', title: 'Gateway' });
    expect(resolvePageHeader('/logs')).toMatchObject({ id: 'system', title: 'Logs' });
    expect(resolvePageHeader('/agents')).toMatchObject({ id: 'system', title: 'Agents' });
    expect(resolvePageHeader('/skills')).toMatchObject({ id: 'system', title: 'Skills' });
    expect(resolvePageHeader('/metrics')).toMatchObject({ id: 'operations', title: 'Metrics' });
  });

});
