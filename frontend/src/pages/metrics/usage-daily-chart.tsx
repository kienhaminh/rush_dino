import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCost, formatTokens, formatDayLabel, formatFullDate } from './usage-metrics-helpers';
import type { CostDailyEntry, ChartMode, DailyChartMode } from './usage-types';

interface UsageDailyChartProps {
  data: CostDailyEntry[];
  selectedDays: string[];
  chartMode: ChartMode;
  dailyChartMode: DailyChartMode;
  onDailyChartModeChange: (mode: DailyChartMode) => void;
  onSelectDay: (day: string, shiftKey: boolean) => void;
}

export function UsageDailyChart({
  data,
  selectedDays,
  chartMode,
  dailyChartMode,
  onDailyChartModeChange,
  onSelectDay,
}: UsageDailyChartProps) {
  const isTokenMode = chartMode === 'tokens';

  if (data.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No data — select a date range and refresh.
          </div>
        </CardContent>
      </Card>
    );
  }

  const values = data.map((d) => (isTokenMode ? d.totalTokens : d.totalCost));
  const maxValue = Math.max(...values, isTokenMode ? 1 : 0.0001);
  const showTotals = data.length <= 14;

  // Responsive bar max-width based on number of days
  const barMaxWidth = data.length > 30 ? 12 : data.length > 20 ? 18 : data.length > 14 ? 24 : 36;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 flex flex-row justify-between items-center">
        <CardTitle className="text-base">Daily {isTokenMode ? 'Token' : 'Cost'} Usage</CardTitle>
        {/* Chart mode toggle */}
        <div className="flex items-center bg-muted/50 rounded p-0.5">
          {(['total', 'by-type'] as DailyChartMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onDailyChartModeChange(mode)}
              className={`px-2 py-0.5 text-xs font-medium rounded transition-all ${
                dailyChartMode === mode
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode === 'total' ? 'Total' : 'By Type'}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="flex items-end gap-0.5 px-1 border-b border-border/50"
          style={{ height: 160 }}
        >
          {data.map((d, idx) => {
            const value = values[idx];
            const heightPct = (value / maxValue) * 100;
            const isSelected = selectedDays.includes(d.date);
            const shortLabel =
              data.length > 20 ? String(parseInt(d.date.slice(8), 10)) : formatDayLabel(d.date);

            // Build tooltip
            const tooltipLines = [
              `${formatFullDate(d.date)}`,
              `${formatTokens(d.totalTokens)} tokens`,
              formatCost(d.totalCost),
            ];
            if (dailyChartMode === 'by-type') {
              if (isTokenMode) {
                tooltipLines.push(
                  `Output ${formatTokens(d.output)}`,
                  `Input ${formatTokens(d.input)}`,
                  `Cache Write ${formatTokens(d.cacheWrite)}`,
                  `Cache Read ${formatTokens(d.cacheRead)}`,
                );
              } else {
                tooltipLines.push(
                  `Output ${formatCost(d.outputCost ?? 0)}`,
                  `Input ${formatCost(d.inputCost ?? 0)}`,
                  `Cache Write ${formatCost(d.cacheWriteCost ?? 0)}`,
                  `Cache Read ${formatCost(d.cacheReadCost ?? 0)}`,
                );
              }
            }

            return (
              <div
                key={d.date}
                className={`relative flex-1 flex flex-col justify-end items-center cursor-pointer group ${
                  isSelected ? 'opacity-100' : ''
                }`}
                style={{ maxWidth: barMaxWidth }}
                onClick={(e) => onSelectDay(d.date, e.shiftKey)}
                title={tooltipLines.join('\n')}
              >
                {/* Tooltip */}
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 invisible group-hover:visible pointer-events-none whitespace-nowrap bg-popover border border-border text-popover-foreground text-[10px] px-2 py-1.5 rounded shadow-lg">
                  <strong>{formatFullDate(d.date)}</strong>
                  <br />
                  {formatTokens(d.totalTokens)} tokens
                  <br />
                  {formatCost(d.totalCost)}
                </div>

                {/* Value label on top */}
                {showTotals && (
                  <div className="text-[9px] text-muted-foreground mb-0.5 leading-none tabular-nums">
                    {isTokenMode ? formatTokens(value) : formatCost(value)}
                  </div>
                )}

                {/* Bar */}
                {dailyChartMode === 'by-type' ? (
                  <div
                    className={`w-full rounded-t-sm overflow-hidden flex flex-col transition-opacity ${
                      isSelected ? 'ring-1 ring-primary' : ''
                    } ${selectedDays.length > 0 && !isSelected ? 'opacity-40' : ''}`}
                    style={{ height: `${heightPct}%` }}
                  >
                    {/* Stacked segments: output, input, cache-write, cache-read */}
                    {(() => {
                      const segs = isTokenMode
                        ? [
                            { value: d.output, cls: 'bg-primary' },
                            { value: d.input, cls: 'bg-secondary' },
                            { value: d.cacheWrite, cls: 'bg-primary/50' },
                            { value: d.cacheRead, cls: 'bg-secondary/60' },
                          ]
                        : [
                            { value: d.outputCost ?? 0, cls: 'bg-primary' },
                            { value: d.inputCost ?? 0, cls: 'bg-secondary' },
                            { value: d.cacheWriteCost ?? 0, cls: 'bg-primary/50' },
                            { value: d.cacheReadCost ?? 0, cls: 'bg-secondary/60' },
                          ];
                      const total = segs.reduce((s, seg) => s + seg.value, 0) || 1;
                      return segs.map((seg, si) => (
                        <div
                          key={si}
                          className={seg.cls}
                          style={{ height: `${(seg.value / total) * 100}%` }}
                        />
                      ));
                    })()}
                  </div>
                ) : (
                  <div
                    className={`w-full rounded-t-sm transition-all ${
                      isSelected
                        ? 'bg-primary ring-1 ring-primary'
                        : 'bg-primary/40 group-hover:bg-primary/70'
                    } ${selectedDays.length > 0 && !isSelected ? 'opacity-40' : ''}`}
                    style={{ height: `${heightPct}%` }}
                  />
                )}

                {/* Date label */}
                <div
                  className="text-[9px] text-muted-foreground mt-1 leading-none text-center truncate w-full"
                  style={{ fontSize: data.length > 20 ? 8 : 9 }}
                >
                  {shortLabel}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend for by-type mode */}
        {dailyChartMode === 'by-type' && (
          <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-primary" /> Output
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-secondary" /> Input
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-primary/50" /> Cache Write
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-secondary/60" /> Cache Read
            </span>
          </div>
        )}

        {selectedDays.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            {selectedDays.length} day{selectedDays.length !== 1 ? 's' : ''} selected (Shift+click to
            multi-select)
          </div>
        )}
      </CardContent>
    </Card>
  );
}
