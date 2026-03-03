import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCost, formatTokens, pct, getCostBreakdown } from './usage-metrics-helpers';
import type { UsageTotals, ChartMode } from './usage-types';

interface UsageCostBreakdownProps {
  totals: UsageTotals | null;
  chartMode: ChartMode;
}

export function UsageCostBreakdown({ totals, chartMode }: UsageCostBreakdownProps) {
  if (!totals) return null;

  const isTokenMode = chartMode === 'tokens';
  const breakdown = getCostBreakdown(totals);
  const totalTokens = totals.totalTokens || 1;

  const tokenPcts = {
    output: pct(totals.output, totalTokens),
    input: pct(totals.input, totalTokens),
    cacheWrite: pct(totals.cacheWrite, totalTokens),
    cacheRead: pct(totals.cacheRead, totalTokens),
  };

  const segments = isTokenMode
    ? [
        {
          label: 'Output',
          pct: tokenPcts.output,
          value: formatTokens(totals.output),
          cls: 'bg-violet-500',
        },
        {
          label: 'Input',
          pct: tokenPcts.input,
          value: formatTokens(totals.input),
          cls: 'bg-blue-500',
        },
        {
          label: 'Cache Write',
          pct: tokenPcts.cacheWrite,
          value: formatTokens(totals.cacheWrite),
          cls: 'bg-amber-500',
        },
        {
          label: 'Cache Read',
          pct: tokenPcts.cacheRead,
          value: formatTokens(totals.cacheRead),
          cls: 'bg-emerald-500',
        },
      ]
    : [
        {
          label: 'Output',
          pct: breakdown.output.pct,
          value: formatCost(breakdown.output.cost),
          cls: 'bg-violet-500',
        },
        {
          label: 'Input',
          pct: breakdown.input.pct,
          value: formatCost(breakdown.input.cost),
          cls: 'bg-blue-500',
        },
        {
          label: 'Cache Write',
          pct: breakdown.cacheWrite.pct,
          value: formatCost(breakdown.cacheWrite.cost),
          cls: 'bg-amber-500',
        },
        {
          label: 'Cache Read',
          pct: breakdown.cacheRead.pct,
          value: formatCost(breakdown.cacheRead.cost),
          cls: 'bg-emerald-500',
        },
      ];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          {isTokenMode ? 'Tokens' : 'Cost'} by Type
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stacked bar */}
        <div className="h-4 w-full bg-muted rounded-full overflow-hidden flex">
          {segments.map((seg) =>
            seg.pct > 0.5 ? (
              <div
                key={seg.label}
                className={`h-full transition-all ${seg.cls}`}
                style={{ width: `${seg.pct.toFixed(1)}%` }}
                title={`${seg.label}: ${seg.value} (${seg.pct.toFixed(1)}%)`}
              />
            ) : null,
          )}
        </div>

        {/* Legend with values */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${seg.cls}`} />
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-muted-foreground leading-tight">{seg.label}</span>
                <span className="text-xs font-semibold tabular-nums leading-tight">
                  {seg.value}
                </span>
              </div>
              <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                {seg.pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="pt-2 border-t border-border/50 flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-sm font-bold tabular-nums">
            {isTokenMode ? formatTokens(totals.totalTokens) : formatCost(totals.totalCost)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
