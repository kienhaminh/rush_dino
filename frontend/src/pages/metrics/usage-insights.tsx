import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  formatCost,
  formatTokens,
  formatDuration,
  buildUsageInsightStats,
} from './usage-metrics-helpers';
import type { UsageTotals, UsageAggregates, SessionUsageEntry } from './usage-types';

interface UsageInsightsProps {
  totals: UsageTotals | null;
  aggregates: UsageAggregates;
  sessions: SessionUsageEntry[];
  sessionCount: number;
  totalSessions: number;
  showCostHint?: boolean;
}

type SummaryCardProps = {
  title: string;
  value: string;
  sub?: string;
  hint?: string;
  valueClass?: string;
};

function SummaryCard({ title, value, sub, hint, valueClass = '' }: SummaryCardProps) {
  return (
    <div className="flex flex-col gap-1 p-4 bg-muted/30 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {hint && (
          <span
            title={hint}
            className="text-[10px] w-4 h-4 rounded-full bg-muted flex items-center justify-center text-muted-foreground cursor-help leading-none flex-shrink-0"
          >
            ?
          </span>
        )}
      </div>
      <div className={`text-xl font-bold tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

type InsightListItem = { label: string; value: string; sub?: string };

function InsightList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: InsightListItem[];
  emptyLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/20 rounded-lg border border-border/50">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground/60">{emptyLabel}</div>
      ) : (
        <div className="flex flex-col divide-y divide-border/30">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-xs truncate pr-2 text-foreground/80">{item.label}</span>
              <span className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-xs font-medium tabular-nums">{item.value}</span>
                {item.sub && <span className="text-[10px] text-muted-foreground">{item.sub}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function UsageInsights({
  totals,
  aggregates,
  sessions,
  sessionCount,
  totalSessions,
  showCostHint,
}: UsageInsightsProps) {
  if (!totals) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 bg-muted/20 rounded-lg border border-border/50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const stats = buildUsageInsightStats(sessions, totals, aggregates);
  const cacheBase = totals.input + totals.cacheRead;
  const cacheHitRate = cacheBase > 0 ? totals.cacheRead / cacheBase : 0;
  const cacheHitLabel = cacheBase > 0 ? `${(cacheHitRate * 100).toFixed(1)}%` : '—';
  const errorRatePct = stats.errorRate * 100;
  const avgTokens = aggregates.messages.total
    ? Math.round(totals.totalTokens / aggregates.messages.total)
    : 0;
  const avgCost = aggregates.messages.total ? totals.totalCost / aggregates.messages.total : 0;
  const throughputLabel =
    stats.throughputTokensPerMin !== undefined
      ? `${formatTokens(Math.round(stats.throughputTokensPerMin))} tok/min`
      : '—';
  const avgDurationLabel = stats.durationCount > 0 ? formatDuration(stats.avgDurationMs) : '—';

  const topModels = aggregates.byModel.slice(0, 5).map((e) => ({
    label: e.model ?? 'unknown',
    value: formatCost(e.totals.totalCost ?? 0),
    sub: formatTokens(e.totals.totalTokens ?? 0),
  }));
  const topProviders = aggregates.byProvider.slice(0, 5).map((e) => ({
    label: e.provider ?? 'unknown',
    value: formatCost(e.totals.totalCost ?? 0),
    sub: formatTokens(e.totals.totalTokens ?? 0),
  }));
  const topTools = aggregates.tools.tools.slice(0, 5).map((t) => ({
    label: t.name,
    value: `${t.count}`,
    sub: 'calls',
  }));
  const topAgents = aggregates.byAgent.slice(0, 5).map((e) => ({
    label: e.agentId,
    value: formatCost(e.totals.totalCost ?? 0),
    sub: formatTokens(e.totals.totalTokens ?? 0),
  }));

  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-4 space-y-4">
        {/* Summary grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <SummaryCard
            title="Messages"
            value={String(aggregates.messages.total)}
            sub={`${aggregates.messages.user} user · ${aggregates.messages.assistant} asst`}
            hint="Total user + assistant messages in range."
          />
          <SummaryCard
            title="Tool Calls"
            value={String(aggregates.tools.totalCalls)}
            sub={`${aggregates.tools.uniqueTools} tools used`}
            hint="Total tool call count across sessions."
          />
          <SummaryCard
            title="Errors"
            value={String(aggregates.messages.errors)}
            sub={`${aggregates.messages.toolResults} tool results`}
            hint="Total message/tool errors in range."
          />
          <SummaryCard
            title="Avg Tokens / Msg"
            value={formatTokens(avgTokens)}
            sub={`${aggregates.messages.total || 0} messages`}
          />
          <SummaryCard
            title="Avg Cost / Msg"
            value={formatCost(avgCost, 4)}
            sub={`${formatCost(totals.totalCost)} total`}
            hint={
              showCostHint ? 'Cost data missing for some sessions.' : 'Average cost per message.'
            }
          />
          <SummaryCard
            title="Sessions"
            value={String(sessionCount)}
            sub={`of ${totalSessions} in range`}
          />
          <SummaryCard
            title="Throughput"
            value={throughputLabel}
            sub={
              stats.throughputCostPerMin !== undefined
                ? `${formatCost(stats.throughputCostPerMin, 4)}/min`
                : undefined
            }
            hint="Tokens processed per minute over active session time."
          />
          <SummaryCard
            title="Error Rate"
            value={`${errorRatePct.toFixed(2)}%`}
            sub={`${aggregates.messages.errors} errors · ${avgDurationLabel} avg`}
            valueClass={
              errorRatePct > 5
                ? 'text-destructive'
                : errorRatePct > 1
                  ? 'text-primary/60'
                  : 'text-primary'
            }
          />
          <SummaryCard
            title="Cache Hit Rate"
            value={cacheHitLabel}
            sub={`${formatTokens(totals.cacheRead)} cached of ${formatTokens(cacheBase)}`}
            hint="Cache read / (input + cache read). Higher is better."
            valueClass={
              cacheHitRate > 0.6
                ? 'text-primary'
                : cacheHitRate > 0.3
                  ? 'text-primary/60'
                  : 'text-destructive'
            }
          />
        </div>

        {/* Insight lists */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InsightList title="Top Models" items={topModels} emptyLabel="No model data" />
          <InsightList title="Top Providers" items={topProviders} emptyLabel="No provider data" />
          <InsightList title="Top Tools" items={topTools} emptyLabel="No tool calls" />
          <InsightList title="Top Agents" items={topAgents} emptyLabel="No agent data" />
        </div>
      </CardContent>
    </Card>
  );
}
