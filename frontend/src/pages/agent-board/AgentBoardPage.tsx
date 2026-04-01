import { useMemo } from 'react';
import { RefreshCwIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AgentRecord } from '@/pages/agents/agent-types';
import type { KanbanBoardStats } from '@/pages/kanban/kanban-types';
import { useAgentProgressBoardQuery, useAgentHealthQuery, useResetAgentHealthMutation } from '@/lib/queries';

import {
  buildOverviewBoardColumns,
  type OverviewAgentCard,
  type OverviewAgentStatus,
} from './agent-board-status';
import { AgentHealthIndicator } from './agent-health-indicator';
import { useAgentRecords, useKanbanStats } from './use-agent-board-data';

// ------------------------------------------------------------------
// Team activity summary bar
// ------------------------------------------------------------------

function TeamActivityBar({ stats }: { stats: KanbanBoardStats | null }) {
  if (!stats) return null;

  const items = [
    { label: 'Backlog', value: stats.backlog, color: 'text-muted-foreground' },
    { label: 'In Progress', value: stats.inProgress, color: 'text-yellow-400' },
    { label: 'In Review', value: stats.inReview, color: 'text-purple-400' },
    { label: 'Blocked', value: stats.blocked, color: 'text-red-400' },
    { label: 'Done', value: stats.done, color: 'text-green-400' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 rounded-lg border border-border/50 bg-card/70">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mr-1">
        Team Activity
      </span>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1 text-[10px]">
          <span className="text-muted-foreground">{item.label}:</span>
          <span className={`font-semibold ${item.color}`}>{item.value}</span>
        </span>
      ))}
      <span className="flex items-center gap-1 text-[10px] ml-auto">
        <span className="text-muted-foreground">Total:</span>
        <span className="font-semibold text-foreground">{stats.total}</span>
      </span>
    </div>
  );
}

// ------------------------------------------------------------------
// Main page
// ------------------------------------------------------------------

export function AgentBoardPage() {
  const { data: board, isPending: loading, isError, error, refetch, isFetching: refreshing } =
    useAgentProgressBoardQuery();

  // Fetch agent records for claimTags and tools
  const { data: agentRecords = [] } = useAgentRecords();

  // Fetch kanban stats for team activity bar
  const kanbanStats = useKanbanStats();

  const columns = useMemo(
    () => buildOverviewBoardColumns(board?.lanes ?? []),
    [board?.lanes],
  );

  // Build a lookup for agent records by name
  const agentRecordByName = useMemo(() => {
    const map: Record<string, AgentRecord> = {};
    for (const agent of agentRecords) {
      map[agent.name] = agent;
    }
    return map;
  }, [agentRecords]);

  const totalAgents =
    columns.active.length + columns.recent.length + columns.idle.length + columns.blocked.length;

  return (
    <div className="flex flex-col h-full bg-background min-h-[calc(100vh-72px)] p-6 md:p-8 overflow-y-auto w-full">
      <div className="w-full space-y-5 pb-12">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-border/50 bg-muted/40">
              {totalAgents} agents
            </Badge>
            {board?.generatedAt ? (
              <Badge variant="outline" className="text-[10px] border-border/50 bg-muted/40">
                Updated {formatDateTime(board.generatedAt)}
              </Badge>
            ) : null}
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={refreshing}>
            <RefreshCwIcon className={`w-3.5 h-3.5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Team activity bar */}
        <TeamActivityBar stats={kanbanStats} />

        {/* Error / loading states */}
        {isError && error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </div>
        ) : null}

        {loading && !board ? (
          <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">
            Loading overview board…
          </div>
        ) : null}

        {!loading && totalAgents === 0 ? (
          <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">
            No agent data available.
          </div>
        ) : null}

        {/* Agent grid */}
        {totalAgents > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...columns.active, ...columns.recent, ...columns.blocked, ...columns.idle].map((card) => (
              <AgentStatusCard
                key={card.agentId}
                card={card}
                agentRecord={agentRecordByName[card.name]}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Agent card
// ------------------------------------------------------------------

function AgentStatusCard({
  card,
  agentRecord,
}: {
  card: OverviewAgentCard;
  agentRecord: AgentRecord | undefined;
}) {
  const { data: health } = useAgentHealthQuery(card.name);
  const resetHealthMutation = useResetAgentHealthMutation();

  const claimTags = agentRecord?.claimTags ?? [];
  const toolsRaw = agentRecord?.tools ?? '';
  const toolNames = parseToolNames(toolsRaw);

  const visibleTags = claimTags.slice(0, 5);
  const overflowTags = claimTags.length - visibleTags.length;

  return (
    <article className="rounded-md border border-border/50 bg-background p-3 space-y-2.5">
      {/* Header: emoji + name + status badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg border border-border/50 bg-secondary flex items-center justify-center text-sm shrink-0">
            {card.emoji || '🤖'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{card.name}</p>
            <p className="text-[11px] font-mono text-muted-foreground truncate">{card.agentId}</p>
          </div>
        </div>
        <StatusBadge status={card.status} />
      </div>

      {/* Health indicator */}
      <AgentHealthIndicator
        health={health}
        onReset={() => resetHealthMutation.mutate(card.name)}
      />

      {/* Routes to: claim tag pills */}
      {claimTags.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[8px] font-semibold uppercase tracking-widest text-muted-foreground">
            Routes to
          </p>
          <div className="flex flex-wrap gap-1">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-primary/10 border border-primary/30 text-primary"
              >
                {tag}
              </span>
            ))}
            {overflowTags > 0 ? (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-muted/60 border border-border/50 text-muted-foreground">
                +{overflowTags}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Tools */}
      {toolNames.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[8px] font-semibold uppercase tracking-widest text-muted-foreground">
            Tools
          </p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {toolNames.join(', ')}
          </p>
        </div>
      ) : null}

      {/* Activity counters */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <Badge variant="outline" className="border-border/50 bg-muted/40">
          Now {card.nowCount}
        </Badge>
        <Badge variant="outline" className="border-border/50 bg-muted/40">
          Recent {card.recentCount}
        </Badge>
        <Badge variant="outline" className="border-border/50 bg-muted/40">
          Blocked {card.blockedCount}
        </Badge>
      </div>

      {/* Preview */}
      {card.preview ? (
        <p className="text-[11px] text-foreground/80 line-clamp-2">{card.preview}</p>
      ) : null}
    </article>
  );
}

// ------------------------------------------------------------------
// Status badge
// ------------------------------------------------------------------

function StatusBadge({ status }: { status: OverviewAgentStatus }) {
  if (status === 'blocked') {
    return (
      <Badge variant="destructive" className="text-[10px] h-5">
        Blocked
      </Badge>
    );
  }
  if (status === 'active') {
    return (
      <Badge variant="default" className="text-[10px] h-5">
        Active
      </Badge>
    );
  }
  if (status === 'recent') {
    return (
      <Badge variant="secondary" className="text-[10px] h-5">
        Recent
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] h-5">
      Idle
    </Badge>
  );
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Parse a comma-separated or JSON-array tools string into a list of names. */
function parseToolNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      // Fall through to comma split
    }
  }
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export default AgentBoardPage;
