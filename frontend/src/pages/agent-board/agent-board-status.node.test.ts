import { describe, expect, it } from 'vitest';

import type { AgentProgressLane } from '@/pages/agents/agent-types';

import { buildOverviewBoardColumns } from './agent-board-status';

function lane(partial: Partial<AgentProgressLane>): AgentProgressLane {
  return {
    agentId: partial.agentId ?? 'agent-a',
    name: partial.name ?? 'Agent A',
    emoji: partial.emoji ?? '🤖',
    summary: {
      nowCount: partial.summary?.nowCount ?? 0,
      recentCount: partial.summary?.recentCount ?? 0,
      blockedCount: partial.summary?.blockedCount ?? 0,
      totalCount: partial.summary?.totalCount ?? 0,
      lastActivityAt: partial.summary?.lastActivityAt,
    },
    columns: {
      now: partial.columns?.now ?? [],
      recent: partial.columns?.recent ?? [],
      blocked: partial.columns?.blocked ?? [],
    },
  };
}

describe('buildOverviewBoardColumns', () => {
  it('maps blocked when blockedCount > 0 even if nowCount > 0', () => {
    const columns = buildOverviewBoardColumns([
      lane({
        summary: { nowCount: 1, recentCount: 0, blockedCount: 1, totalCount: 2 },
      }),
    ]);

    expect(columns.blocked).toHaveLength(1);
    expect(columns.active).toHaveLength(0);
  });

  it('maps active when nowCount > 0 and blockedCount = 0', () => {
    const columns = buildOverviewBoardColumns([
      lane({
        summary: { nowCount: 1, recentCount: 2, blockedCount: 0, totalCount: 3 },
      }),
    ]);

    expect(columns.active).toHaveLength(1);
    expect(columns.recent).toHaveLength(0);
  });

  it('maps recent when only recentCount > 0', () => {
    const columns = buildOverviewBoardColumns([
      lane({
        summary: { nowCount: 0, recentCount: 2, blockedCount: 0, totalCount: 2 },
      }),
    ]);

    expect(columns.recent).toHaveLength(1);
    expect(columns.idle).toHaveLength(0);
  });

  it('maps idle when all counts are zero', () => {
    const columns = buildOverviewBoardColumns([
      lane({
        summary: { nowCount: 0, recentCount: 0, blockedCount: 0, totalCount: 0 },
      }),
    ]);

    expect(columns.idle).toHaveLength(1);
    expect(columns.active).toHaveLength(0);
    expect(columns.recent).toHaveLength(0);
    expect(columns.blocked).toHaveLength(0);
  });

  it('uses preview precedence blocked > now > recent', () => {
    const columns = buildOverviewBoardColumns([
      lane({
        summary: { nowCount: 1, recentCount: 1, blockedCount: 1, totalCount: 3 },
        columns: {
          blocked: [
            {
              id: 'b1',
              status: 'blocked',
              title: 'blocked preview',
              sourceTool: 'delegate_to_agent',
              conversationId: 'c1',
              startedAt: '2026-03-04T00:00:00Z',
              completedAt: '2026-03-04T00:01:00Z',
              isError: true,
            },
          ],
          now: [
            {
              id: 'n1',
              status: 'now',
              title: 'now preview',
              sourceTool: 'delegate_to_agent',
              conversationId: 'c2',
              startedAt: '2026-03-04T00:00:00Z',
              completedAt: '2026-03-04T00:01:00Z',
              isError: false,
            },
          ],
          recent: [
            {
              id: 'r1',
              status: 'recent',
              title: 'recent preview',
              sourceTool: 'delegate_to_agent',
              conversationId: 'c3',
              startedAt: '2026-03-04T00:00:00Z',
              completedAt: '2026-03-04T00:01:00Z',
              isError: false,
            },
          ],
        },
      }),
    ]);

    expect(columns.blocked[0].preview).toBe('blocked preview');
  });
});
