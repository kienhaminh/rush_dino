import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCwIcon } from 'lucide-react';

import type {
  AgentProgressBoardResponse,
  AgentProgressCard,
  AgentProgressCardStatus,
  AgentProgressLane,
} from './agent-types';

type AgentProgressBoardPanelProps = {
  board: AgentProgressBoardResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
};

export function AgentProgressBoardPanel({
  board,
  loading,
  refreshing,
  error,
  onRefresh,
}: AgentProgressBoardPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold">Agent Progress Board</p>
          <p className="text-sm text-muted-foreground">
            Read-only kanban monitor of delegated work across all agents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {board?.generatedAt ? (
            <Badge variant="outline" className="font-mono text-[10px] border-border/50 bg-muted/40">
              Updated {formatDateTime(board.generatedAt)}
            </Badge>
          ) : null}
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}>
            <RefreshCwIcon className={`w-3.5 h-3.5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading && !board ? (
        <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">
          Loading progress board…
        </div>
      ) : null}

      {board?.lanes?.length ? (
        <div className="space-y-4">
          {board.lanes.map((lane) => (
            <LaneRow key={lane.agentId} lane={lane} />
          ))}
        </div>
      ) : null}

      {!loading && (!board || board.lanes.length === 0) ? (
        <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">
          No delegated activity found in the current lookback window.
        </div>
      ) : null}
    </div>
  );
}

function LaneRow({ lane }: { lane: AgentProgressLane }) {
  const lastActivity = lane.summary.lastActivityAt
    ? formatDateTime(lane.summary.lastActivityAt)
    : 'n/a';

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg border border-border/50 bg-secondary flex items-center justify-center text-base">
            {lane.emoji || '🤖'}
          </div>
          <div>
            <p className="text-sm font-semibold">{lane.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{lane.agentId}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-border/50 bg-muted/40">
            Now {lane.summary.nowCount}
          </Badge>
          <Badge variant="outline" className="text-[10px] border-border/50 bg-muted/40">
            Recent {lane.summary.recentCount}
          </Badge>
          <Badge variant="outline" className="text-[10px] border-border/50 bg-muted/40">
            Blocked {lane.summary.blockedCount}
          </Badge>
          <Badge variant="outline" className="text-[10px] border-border/50 bg-muted/40">
            Last {lastActivity}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <LaneColumn title="Now" cards={lane.columns.now} />
        <LaneColumn title="Recent" cards={lane.columns.recent} />
        <LaneColumn title="Blocked" cards={lane.columns.blocked} />
      </div>
    </div>
  );
}

function LaneColumn({ title, cards }: { title: string; cards: AgentProgressCard[] }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3 min-h-[160px]">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
      {cards.length === 0 ? (
        <p className="text-xs text-muted-foreground">No items</p>
      ) : (
        cards.map((card) => (
          <article key={card.id} className="rounded-md border border-border/50 bg-card p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm leading-snug">{card.title}</p>
              <StatusBadge status={card.status} />
            </div>
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p className="font-mono">tool: {card.sourceTool}</p>
              <p className="font-mono">conversation: {truncateId(card.conversationId)}</p>
              <p>completed: {formatDateTime(card.completedAt)}</p>
            </div>
          </article>
        ))
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: AgentProgressCardStatus }) {
  if (status === 'blocked') {
    return (
      <Badge variant="destructive" className="text-[10px] h-5">
        Blocked
      </Badge>
    );
  }
  if (status === 'now') {
    return (
      <Badge variant="default" className="text-[10px] h-5">
        Now
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] h-5">
      Recent
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

function truncateId(value: string) {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
