import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  OperationalStatusCard,
  OperationsSummaryStrip,
  summarizeChannels,
  summarizeRuntime,
} from './system-summary-panels';
import type { SystemSummaryResponse } from '@/lib/types';

const summary: SystemSummaryResponse = {
  generatedAt: '2026-03-17T00:00:00Z',
  status: 'degraded',
  uptimeSecs: 3661,
  activeProvider: 'openai',
  effectiveProfileId: 'ops',
  defaultProfileId: 'ops',
  runtimeUnavailableError: null,
  profilesCount: 2,
  fallbackProfileIds: [],
  channels: [
    { id: 'telegram', label: 'Telegram', enabled: true, configured: true, status: 'healthy' },
    {
      id: 'discord',
      label: 'Discord',
      enabled: true,
      configured: false,
      status: 'needs_attention',
      issue: 'Missing bot token.',
    },
    { id: 'slack', label: 'Slack', enabled: false, configured: false, status: 'disabled' },
  ],
  approvals: {
    pendingCount: 2,
    pending: [
      {
        requestId: 'req-1',
        sessionId: 'session-1',
        conversationId: 'conversation-1',
        tool: 'shell_exec',
      },
    ],
  },
  runs: {
    totalCount: 9,
    activeCount: 3,
    queuedCount: 4,
    blockedCount: 1,
    failedCount: 0,
    mostRecentId: 'run-1',
  },
  conversations: {
    totalCount: 4,
    updatedLastHour: 2,
    mostRecentId: 'conversation-1',
    mostRecentTitle: 'Ops follow-up',
  },
  security: {
    hmacAuthEnabled: true,
    allowedOriginsCount: 1,
    sandboxEnabled: true,
    sandboxAllowNetwork: false,
    sandboxWorkspaceRoot: '/tmp',
  },
  incidents: [
    {
      id: 'incident-1',
      level: 'warn',
      target: 'gateway',
      message: 'Discord degraded',
      createdAt: '2026-03-17T00:00:00Z',
    },
  ],
  agentConfig: null,
};

describe('system summary panels', () => {
  it('formats compact channel and runtime summaries', () => {
    expect(summarizeChannels(summary)).toBe('1 needs attention, 1 healthy, 1 disabled');
    expect(summarizeRuntime(summary)).toBe('3 active, 4 queued, 1 blocked');
  });

  it('renders the compact operations strip and operational status card', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OperationsSummaryStrip summary={summary} />
        <OperationalStatusCard summary={summary} />
      </MemoryRouter>,
    );

    expect(html).toContain('channels need attention');
    expect(html).toContain('Operational status');
    expect(html).toContain('Open channels');
    expect(html).toContain('Pending approvals');
    expect(html).toContain('Sandbox enabled');
  });
});
