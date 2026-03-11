import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buildUsageMosaicStats, formatTokens, getZonedHour } from './usage-metrics-helpers';
import type { SessionUsageEntry, TimeZone } from './usage-types';

interface UsageActivityMosaicProps {
  data: SessionUsageEntry[];
  timeZone: TimeZone;
  selectedHours: number[];
  onSelectHour: (hour: number, shiftKey: boolean) => void;
}

export function UsageActivityMosaic({
  data,
  timeZone,
  selectedHours,
  onSelectHour,
}: UsageActivityMosaicProps) {
  const stats = buildUsageMosaicStats(data, timeZone);

  if (!stats.hasData) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Activity by Time</CardTitle>
            <span className="text-xs text-muted-foreground">{formatTokens(0)} tokens</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Estimates require session timestamps from the gateway.
          </p>
        </CardHeader>
        <CardContent>
          <div className="text-center text-sm text-muted-foreground py-6">
            No timeline data — refresh with a date range to see activity.
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxHour = Math.max(...stats.hourTotals, 1);
  const maxWeekday = Math.max(...stats.weekdayTotals.map((d) => d.tokens), 1);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity by Time</CardTitle>
          <span className="text-xs text-muted-foreground">
            {formatTokens(stats.totalTokens)} tokens ·{' '}
            <span className="capitalize">{timeZone === 'utc' ? 'UTC' : 'Local'} tz</span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Estimated from session spans (first/last activity). Click hours to filter.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Day of week */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Day of Week
            </div>
            <div className="flex gap-1">
              {stats.weekdayTotals.map((part) => {
                const intensity = Math.min(part.tokens / maxWeekday, 1);
                const opacity = part.tokens > 0 ? 0.12 + intensity * 0.7 : 0;
                return (
                  <div
                    key={part.label}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${part.label}: ${formatTokens(part.tokens)}`}
                  >
                    <div
                      className="w-full rounded"
                      style={{
                        height: 40,
                        background: opacity > 0 ? `rgba(34, 211, 200, ${opacity})` : 'transparent',
                        border: '1px solid',
                        borderColor:
                          opacity > 0 ? `rgba(34, 211, 200, 0.3)` : 'rgba(255,255,255,0.05)',
                      }}
                    />
                    <span className="text-[9px] text-muted-foreground">{part.label}</span>
                    <span className="text-[9px] text-muted-foreground tabular-nums">
                      {formatTokens(part.tokens)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hours of day */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide flex items-center justify-between">
              <span>Hour of Day</span>
              {selectedHours.length > 0 && (
                <span className="normal-case text-primary">
                  {selectedHours.length} hour{selectedHours.length !== 1 ? 's' : ''} selected
                </span>
              )}
            </div>
            <div className="grid grid-cols-12 gap-0.5">
              {stats.hourTotals.map((value, hour) => {
                const intensity = Math.min(value / maxHour, 1);
                const opacity = value > 0 ? 0.08 + intensity * 0.7 : 0;
                const borderOpacity = intensity > 0.7 ? 0.6 : 0.2;
                const isSelected = selectedHours.includes(hour);
                return (
                  <div
                    key={hour}
                    onClick={(e) => onSelectHour(hour, e.shiftKey)}
                    className={`relative h-6 rounded-sm cursor-pointer transition-all ${
                      isSelected ? 'ring-1 ring-primary ring-offset-0' : ''
                    } ${selectedHours.length > 0 && !isSelected ? 'opacity-50' : ''}`}
                    style={{
                      background:
                        opacity > 0 ? `rgba(34, 211, 200, ${opacity})` : 'rgba(255,255,255,0.03)',
                      border: `1px solid rgba(34, 211, 200, ${borderOpacity})`,
                    }}
                    title={`${hour}:00 — ${hour + 1}:00\n${formatTokens(value)} tokens`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
              <span>Midnight</span>
              <span>4am</span>
              <span>8am</span>
              <span>Noon</span>
              <span>4pm</span>
              <span>8pm</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <div
                className="w-3 h-3 rounded-sm"
                style={{
                  background: 'rgba(34, 211, 200, 0.08)',
                  border: '1px solid rgba(34, 211, 200, 0.2)',
                }}
              />
              <span className="text-[9px] text-muted-foreground">Low</span>
              <div
                className="w-3 h-3 rounded-sm ml-1"
                style={{
                  background: 'rgba(34, 211, 200, 0.78)',
                  border: '1px solid rgba(34, 211, 200, 0.6)',
                }}
              />
              <span className="text-[9px] text-muted-foreground">High token density</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
