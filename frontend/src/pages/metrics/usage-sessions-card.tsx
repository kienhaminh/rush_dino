import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowDownIcon, ArrowUpIcon, FileTextIcon, CopyIcon } from 'lucide-react';
import { formatCost, formatTokens, getSessionValue } from './usage-metrics-helpers';
import type { SessionUsageEntry, ChartMode, SessionSort, SortDir } from './usage-types';

interface UsageSessionsCardProps {
  sessions: SessionUsageEntry[];
  selectedIds: string[];
  selectedDays: string[];
  chartMode: ChartMode;
  sessionSort: SessionSort;
  sessionSortDir: SortDir;
  onSelect: (key: string, shiftKey: boolean) => void;
  onSortChange: (sort: SessionSort) => void;
  onSortDirChange: (dir: SortDir) => void;
  onClearSelection: () => void;
  totalSessions: number;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* best effort */
  }
}

function formatSessionLabel(s: SessionUsageEntry): string {
  const raw = s.label || s.key;
  if (raw.startsWith('agent:') && raw.includes('?token=')) {
    return raw.slice(0, raw.indexOf('?token='));
  }
  return raw;
}

export function UsageSessionsCard({
  sessions,
  selectedIds,
  selectedDays,
  chartMode,
  sessionSort,
  sessionSortDir,
  onSelect,
  onSortChange,
  onSortDirChange,
  onClearSelection,
  totalSessions,
}: UsageSessionsCardProps) {
  const selectedSet = new Set(selectedIds);

  const sorted = [...sessions].sort((a, b) => {
    let diff = 0;
    switch (sessionSort) {
      case 'recent':
        diff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
        break;
      case 'messages':
        diff = (b.usage?.messageCounts?.total ?? 0) - (a.usage?.messageCounts?.total ?? 0);
        break;
      case 'errors':
        diff = (b.usage?.messageCounts?.errors ?? 0) - (a.usage?.messageCounts?.errors ?? 0);
        break;
      case 'cost':
      case 'tokens':
      default:
        diff =
          getSessionValue(b, selectedDays, chartMode) - getSessionValue(a, selectedDays, chartMode);
    }
    return sessionSortDir === 'asc' ? -diff : diff;
  });

  const totalValue = sorted.reduce(
    (sum, s) => sum + getSessionValue(s, selectedDays, chartMode),
    0,
  );
  const avgValue = sorted.length ? totalValue / sorted.length : 0;
  const totalErrors = sorted.reduce((sum, s) => sum + (s.usage?.messageCounts?.errors ?? 0), 0);

  return (
    <Card className="bg-card border-border flex flex-col h-full">
      <CardHeader className="border-b border-border pb-3 flex-none">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Sessions</CardTitle>
          <span className="text-xs text-muted-foreground">
            {sessions.length} shown
            {totalSessions !== sessions.length ? ` · ${totalSessions} total` : ''}
          </span>
        </div>
        {/* Stats and controls */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>
              {chartMode === 'tokens' ? formatTokens(avgValue) : formatCost(avgValue)} avg
            </span>
            <span>{totalErrors} errors</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Select value={sessionSort} onValueChange={(val) => onSortChange(val as SessionSort)}>
              <SelectTrigger className="h-6 text-xs px-2 bg-background border border-border rounded focus:outline-none text-foreground w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cost">Cost</SelectItem>
                <SelectItem value="tokens">Tokens</SelectItem>
                <SelectItem value="messages">Messages</SelectItem>
                <SelectItem value="errors">Errors</SelectItem>
                <SelectItem value="recent">Recent</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => onSortDirChange(sessionSortDir === 'desc' ? 'asc' : 'desc')}
              className="h-6 w-6 flex items-center justify-center text-xs border border-border rounded bg-background hover:bg-muted transition-colors"
              title={sessionSortDir === 'desc' ? 'Descending' : 'Ascending'}
            >
              {sessionSortDir === 'desc' ? (
                <ArrowDownIcon className="w-3 h-3" />
              ) : (
                <ArrowUpIcon className="w-3 h-3" />
              )}
            </button>
            {selectedIds.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={onClearSelection}
              >
                Clear ({selectedIds.length})
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 overflow-y-auto flex-1 min-h-0">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No sessions in range
          </div>
        ) : (
          <>
            {sorted.slice(0, 60).map((session) => {
              const isSelected = selectedSet.has(session.key);
              const value = getSessionValue(session, selectedDays, chartMode);
              const displayLabel = formatSessionLabel(session);
              const metaParts: string[] = [];
              if (session.channel) metaParts.push(`ch:${session.channel}`);
              if (session.agentId) metaParts.push(`agent:${session.agentId}`);
              if (session.model) metaParts.push(session.model);

              return (
                <div
                  key={session.key}
                  onClick={(e) => onSelect(session.key, e.shiftKey)}
                  className={`group cursor-pointer border-b border-border/40 px-4 py-3 transition-colors hover:bg-muted/40 ${
                    isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                  }`}
                  title={session.key}
                >
                  <div className="flex items-start gap-2">
                    <FileTextIcon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium truncate text-foreground/90 leading-tight">
                          {displayLabel}
                        </span>
                        <span className="text-xs font-semibold tabular-nums flex-shrink-0 text-foreground/80">
                          {chartMode === 'tokens' ? formatTokens(value) : formatCost(value)}
                        </span>
                      </div>
                      {metaParts.length > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {metaParts.join(' · ')}
                        </div>
                      )}
                      {/* Mini stats row */}
                      <div className="flex items-center gap-2 mt-1">
                        {session.usage?.messageCounts && (
                          <span className="text-[10px] text-muted-foreground">
                            {session.usage.messageCounts.total} msgs
                          </span>
                        )}
                        {(session.usage?.messageCounts?.errors ?? 0) > 0 && (
                          <span className="text-[10px] text-destructive font-medium">
                            {session.usage!.messageCounts!.errors} err
                          </span>
                        )}
                        {session.usage?.toolUsage && session.usage.toolUsage.totalCalls > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {session.usage.toolUsage.totalCalls} tools
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyToClipboard(session.key);
                      }}
                      title="Copy session key"
                    >
                      <CopyIcon className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                </div>
              );
            })}
            {sorted.length > 60 && (
              <div className="text-center text-xs text-muted-foreground p-4">
                +{sorted.length - 60} more sessions
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
