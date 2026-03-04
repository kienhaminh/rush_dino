import { useMemo } from 'react';
import { RefreshCwIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAgentProgressBoard } from '@/pages/agents/use-agent-progress-board';

import {
  buildOverviewBoardColumns,
  type OverviewAgentCard,
  type OverviewAgentStatus,
} from './agent-board-status';

const COLUMN_ORDER: Array<{ key: OverviewAgentStatus; label: string }> = [
  { key: 'active', label: 'Active' },
  { key: 'recent', label: 'Recent' },
  { key: 'idle', label: 'Idle' },
  { key: 'blocked', label: 'Blocked' },
];

export function AgentBoardPage() {
  const { board, loading, refreshing, error, refresh } = useAgentProgressBoard(true);
  const columns = useMemo(
    () => buildOverviewBoardColumns(board?.lanes ?? []),
    [board?.lanes],
  );

  const totalAgents =
    columns.active.length + columns.recent.length + columns.idle.length + columns.blocked.length;

  return (
    <div className="flex flex-col h-full bg-background min-h-[calc(100vh-72px)] p-6 md:p-8 overflow-y-auto w-full">
      <div className="w-full space-y-6 pb-12">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-lg font-semibold">All Agents Overview</p>
            <p className="text-sm text-muted-foreground">
              Status board for every agent using delegated activity telemetry.
            </p>
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
          </div>

          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCwIcon className={`w-3.5 h-3.5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
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

        {totalAgents > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {COLUMN_ORDER.map((column) => (
              <section
                key={column.key}
                className="rounded-xl border border-border/50 bg-card/70 p-3 space-y-3 min-h-[220px]"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {column.label}
                  </p>
                  <Badge variant="outline" className="text-[10px] border-border/50 bg-muted/40">
                    {columns[column.key].length}
                  </Badge>
                </div>

                {columns[column.key].length === 0 ? (
                  <p className="text-xs text-muted-foreground">No agents</p>
                ) : (
                  <div className="space-y-2">
                    {columns[column.key].map((card) => (
                      <AgentStatusCard key={card.agentId} card={card} />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AgentStatusCard({ card }: { card: OverviewAgentCard }) {
  return (
    <article className="rounded-md border border-border/50 bg-background p-3 space-y-2">
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

      <p className="text-[11px] text-muted-foreground">
        Last: {card.lastActivityAt ? formatDateTime(card.lastActivityAt) : 'n/a'}
      </p>
      {card.preview ? (
        <p className="text-[11px] text-foreground/80 line-clamp-2">{card.preview}</p>
      ) : null}
    </article>
  );
}

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
    <Badge variant="outline" className="text-[10px] h-5 border-border/50 bg-muted/40">
      Idle
    </Badge>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export default AgentBoardPage;
