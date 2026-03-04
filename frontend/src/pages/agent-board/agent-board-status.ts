import type {
  AgentProgressCard,
  AgentProgressLane,
} from '@/pages/agents/agent-types';

export type OverviewAgentStatus = 'active' | 'recent' | 'idle' | 'blocked';

export type OverviewAgentCard = {
  agentId: string;
  name: string;
  emoji: string;
  status: OverviewAgentStatus;
  nowCount: number;
  recentCount: number;
  blockedCount: number;
  totalCount: number;
  lastActivityAt?: string;
  preview?: string;
};

export type OverviewBoardColumns = {
  active: OverviewAgentCard[];
  recent: OverviewAgentCard[];
  idle: OverviewAgentCard[];
  blocked: OverviewAgentCard[];
};

export function buildOverviewBoardColumns(lanes: AgentProgressLane[]): OverviewBoardColumns {
  const columns: OverviewBoardColumns = {
    active: [],
    recent: [],
    idle: [],
    blocked: [],
  };

  for (const lane of lanes) {
    const status = deriveStatus(lane);
    const card: OverviewAgentCard = {
      agentId: lane.agentId,
      name: lane.name,
      emoji: lane.emoji,
      status,
      nowCount: lane.summary.nowCount,
      recentCount: lane.summary.recentCount,
      blockedCount: lane.summary.blockedCount,
      totalCount: lane.summary.totalCount,
      lastActivityAt: lane.summary.lastActivityAt,
      preview: selectPreview(lane),
    };

    if (status === 'blocked') {
      columns.blocked.push(card);
      continue;
    }
    if (status === 'active') {
      columns.active.push(card);
      continue;
    }
    if (status === 'recent') {
      columns.recent.push(card);
      continue;
    }
    columns.idle.push(card);
  }

  sortCards(columns.active);
  sortCards(columns.recent);
  sortCards(columns.idle);
  sortCards(columns.blocked);

  return columns;
}

function deriveStatus(lane: AgentProgressLane): OverviewAgentStatus {
  if (lane.summary.blockedCount > 0) {
    return 'blocked';
  }
  if (lane.summary.nowCount > 0) {
    return 'active';
  }
  if (lane.summary.recentCount > 0) {
    return 'recent';
  }
  return 'idle';
}

function selectPreview(lane: AgentProgressLane): string | undefined {
  const priority: AgentProgressCard[] = [
    ...(lane.columns.blocked.length > 0 ? [lane.columns.blocked[0]] : []),
    ...(lane.columns.now.length > 0 ? [lane.columns.now[0]] : []),
    ...(lane.columns.recent.length > 0 ? [lane.columns.recent[0]] : []),
  ];
  return priority[0]?.title;
}

function sortCards(cards: OverviewAgentCard[]) {
  cards.sort((a, b) => {
    if (a.lastActivityAt && b.lastActivityAt) {
      return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    }
    if (a.lastActivityAt) return -1;
    if (b.lastActivityAt) return 1;
    return a.name.localeCompare(b.name);
  });
}
