import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ActivityIcon,
  BrainIcon,
  ClockIcon,
  WrenchIcon,
  AlertCircleIcon,
  XIcon,
} from 'lucide-react';
import { formatCost, formatTokens, formatDuration } from './usage-metrics-helpers';
import type { SessionUsageEntry } from './usage-types';

interface UsageSessionDetailProps {
  session: SessionUsageEntry | null;
  onClose?: () => void;
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function UsageSessionDetail({ session, onClose }: UsageSessionDetailProps) {
  if (!session) {
    return (
      <Card className="bg-card border-border w-full">
        <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <ActivityIcon className="h-10 w-10 opacity-30" />
          <p className="text-sm">Select a session to view details</p>
        </CardContent>
      </Card>
    );
  }

  const usage = session.usage;
  const displayLabel = session.label || session.key;
  const cleanLabel =
    displayLabel.startsWith('agent:') && displayLabel.includes('?token=')
      ? displayLabel.slice(0, displayLabel.indexOf('?token='))
      : displayLabel;

  return (
    <div className="flex flex-col gap-4">
      {/* Overview card */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold leading-tight truncate">
                {cleanLabel}
              </CardTitle>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {session.agentId && (
                  <Badge variant="outline" className="text-[10px] h-5">
                    agent: {session.agentId}
                  </Badge>
                )}
                {session.model && (
                  <Badge variant="outline" className="text-[10px] h-5">
                    {session.model}
                  </Badge>
                )}
                {(session.modelProvider || session.providerOverride) && (
                  <Badge variant="outline" className="text-[10px] h-5">
                    {session.modelProvider ?? session.providerOverride}
                  </Badge>
                )}
                {session.channel && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {session.channel}
                  </Badge>
                )}
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors"
              >
                <XIcon className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Top stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex flex-col gap-0.5 p-3 bg-muted/30 rounded-lg">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Cost
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatCost(usage?.totalCost ?? 0)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 p-3 bg-muted/30 rounded-lg">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Tokens
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatTokens(usage?.totalTokens ?? 0)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 p-3 bg-muted/30 rounded-lg">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Duration
              </span>
              <span className="text-lg font-bold tabular-nums">
                {usage?.durationMs ? formatDuration(usage.durationMs) : '—'}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 p-3 bg-muted/30 rounded-lg">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Messages
              </span>
              <span className="text-lg font-bold tabular-nums">
                {usage?.messageCounts?.total ?? '—'}
              </span>
            </div>
          </div>

          {/* Token breakdown */}
          {usage && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <BrainIcon className="w-3.5 h-3.5" />
                Context Weight
              </h4>
              <div className="bg-muted/30 rounded-lg p-3 space-y-0">
                <StatRow label="Input Tokens" value={usage.input} />
                <StatRow label="Output Tokens" value={usage.output} />
                <StatRow label="Cache Read" value={usage.cacheRead} />
                <StatRow label="Cache Write" value={usage.cacheWrite} />
                <StatRow label="Total Tokens" value={formatTokens(usage.totalTokens)} />
                {usage.inputCost != null && (
                  <StatRow label="Input Cost" value={formatCost(usage.inputCost, 5)} />
                )}
                {usage.outputCost != null && (
                  <StatRow label="Output Cost" value={formatCost(usage.outputCost, 5)} />
                )}
              </div>
            </div>
          )}

          {/* Message counts */}
          {usage?.messageCounts && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <ActivityIcon className="w-3.5 h-3.5" />
                Message Counts
              </h4>
              <div className="bg-muted/30 rounded-lg p-3 space-y-0">
                <StatRow label="Total" value={usage.messageCounts.total} />
                <StatRow label="User" value={usage.messageCounts.user} />
                <StatRow label="Assistant" value={usage.messageCounts.assistant} />
                <StatRow label="Tool Calls" value={usage.messageCounts.toolCalls} />
                <StatRow label="Tool Results" value={usage.messageCounts.toolResults} />
                {usage.messageCounts.errors > 0 && (
                  <div className="flex items-center justify-between py-1.5 border-t border-border/30">
                    <span className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircleIcon className="w-3 h-3" />
                      Errors
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-destructive">
                      {usage.messageCounts.errors}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tool usage */}
          {usage?.toolUsage && usage.toolUsage.totalCalls > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <WrenchIcon className="w-3.5 h-3.5" />
                Tool Usage ({usage.toolUsage.totalCalls} calls)
              </h4>
              <div className="bg-muted/30 rounded-lg p-3">
                {usage.toolUsage.tools.slice(0, 10).map((tool) => (
                  <div
                    key={tool.name}
                    className="flex items-center justify-between py-1 border-b border-border/30 last:border-0"
                  >
                    <span className="text-xs font-mono text-foreground/80 truncate">
                      {tool.name}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0 ml-2">
                      {tool.count}×
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Latency */}
          {usage?.latency && usage.latency.count > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <ClockIcon className="w-3.5 h-3.5" />
                Latency
              </h4>
              <div className="bg-muted/30 rounded-lg p-3 space-y-0">
                <StatRow label="Avg" value={formatDuration(usage.latency.avgMs)} />
                <StatRow label="Min" value={formatDuration(usage.latency.minMs)} />
                <StatRow label="Max" value={formatDuration(usage.latency.maxMs)} />
                <StatRow label="p95" value={formatDuration(usage.latency.p95Ms)} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
