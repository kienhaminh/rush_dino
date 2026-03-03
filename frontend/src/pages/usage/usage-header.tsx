import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DownloadIcon,
  SearchIcon,
  RefreshCwIcon,
  CalendarIcon,
  ChevronDownIcon,
} from 'lucide-react';
import { formatIsoDate } from './usage-metrics-helpers';
import { buildSessionsCsv, buildDailyCsv, downloadTextFile } from './usage-query-helpers';
import type { SessionUsageEntry, CostDailyEntry, ChartMode, TimeZone } from './usage-types';

interface UsageHeaderProps {
  filters: { search?: string; agent?: string; provider?: string; model?: string };
  setFilters: (f: any) => void;
  sessions: SessionUsageEntry[];
  filteredDaily: CostDailyEntry[];
  totals?: { totalTokens: number; totalCost: number } | null;
  sessionCount: number;
  totalSessions: number;
  loading: boolean;
  startDate: string;
  endDate: string;
  onStartDateChange: (d: string) => void;
  onEndDateChange: (d: string) => void;
  chartMode: ChartMode;
  onChartModeChange: (m: ChartMode) => void;
  timeZone: TimeZone;
  onTimeZoneChange: (tz: TimeZone) => void;
  onRefresh: () => void;
}

const DATE_PRESETS = [
  { label: 'Today', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
];

function applyPreset(days: number, onStart: (d: string) => void, onEnd: (d: string) => void): void {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  onStart(formatIsoDate(start));
  onEnd(formatIsoDate(end));
}

export function UsageHeader({
  filters,
  setFilters,
  sessions,
  filteredDaily,
  totals,
  sessionCount,
  totalSessions,
  loading,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  chartMode,
  onChartModeChange,
  timeZone,
  onTimeZoneChange,
  onRefresh,
}: UsageHeaderProps) {
  const exportStamp = formatIsoDate(new Date());
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close export menu on outside click
  useEffect(() => {
    if (!exportOpen) return;
    const onClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [exportOpen]);

  return (
    <div className="flex flex-col border-b border-border bg-card">
      {/* Controls row — single unified toolbar, no title (topbar already shows it) */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-border/50">
        {/* Date presets */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset.days, onStartDateChange, onEndDateChange)}
              className="px-2.5 py-1 text-xs font-medium rounded hover:bg-background hover:shadow-sm transition-all text-muted-foreground hover:text-foreground"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="h-8 px-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="h-8 px-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          />
        </div>

        {/* Timezone */}
        <select
          value={timeZone}
          onChange={(e) => onTimeZoneChange(e.target.value as TimeZone)}
          className="h-8 px-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
        >
          <option value="local">Local TZ</option>
          <option value="utc">UTC</option>
        </select>

        {/* Chart mode toggle */}
        <div className="flex items-center bg-muted/50 rounded-md p-0.5">
          <button
            onClick={() => onChartModeChange('tokens')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${
              chartMode === 'tokens'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Tokens
          </button>
          <button
            onClick={() => onChartModeChange('cost')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${
              chartMode === 'cost'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Cost
          </button>
        </div>

        {/* Metric badges */}
        {totals && (
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium tabular-nums">
              <strong>
                {totals.totalTokens >= 1_000_000
                  ? `${(totals.totalTokens / 1_000_000).toFixed(1)}M`
                  : totals.totalTokens >= 1000
                    ? `${(totals.totalTokens / 1000).toFixed(1)}K`
                    : totals.totalTokens}
              </strong>{' '}
              tok
            </span>
            <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium tabular-nums">
              <strong>${totals.totalCost.toFixed(2)}</strong>
            </span>
            <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full font-medium tabular-nums">
              <strong>{sessionCount}</strong> sess
            </span>
          </div>
        )}

        {/* Right-side: Export + Refresh */}
        <div className="flex items-center gap-2 ml-auto">
          <div ref={exportRef} className="relative">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setExportOpen((v) => !v)}
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              Export
              <ChevronDownIcon className="w-3 h-3 opacity-60" />
            </Button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] bg-popover border border-border rounded-md shadow-lg py-1">
                <button
                  disabled={sessions.length === 0}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  onClick={() => {
                    downloadTextFile(
                      `usage-sessions-${exportStamp}.csv`,
                      buildSessionsCsv(sessions),
                      'text/csv',
                    );
                    setExportOpen(false);
                  }}
                >
                  Sessions CSV
                </button>
                <button
                  disabled={filteredDaily.length === 0}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  onClick={() => {
                    downloadTextFile(
                      `usage-daily-${exportStamp}.csv`,
                      buildDailyCsv(filteredDaily),
                      'text/csv',
                    );
                    setExportOpen(false);
                  }}
                >
                  Daily CSV
                </button>
                <button
                  disabled={sessions.length === 0 && filteredDaily.length === 0}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  onClick={() => {
                    downloadTextFile(
                      `usage-${exportStamp}.json`,
                      JSON.stringify({ sessions, daily: filteredDaily }, null, 2),
                      'application/json',
                    );
                    setExportOpen(false);
                  }}
                >
                  JSON
                </button>
              </div>
            )}
          </div>

          <Button size="sm" onClick={onRefresh} disabled={loading} className="gap-1.5">
            <RefreshCwIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search row */}
      <div className="flex flex-wrap gap-3 px-4 pb-2.5 pt-2">
        <div className="flex-1 min-w-[200px] relative">
          <SearchIcon className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-8 bg-background text-sm"
            placeholder="Search sessions by key, agent, model..."
            value={filters.search || ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
          />
        </div>
        {totalSessions > 0 && (
          <span className="text-xs text-muted-foreground self-center">
            {filters.search && sessionCount !== totalSessions
              ? `${sessionCount} of ${totalSessions} sessions match`
              : `${totalSessions} sessions in range`}
          </span>
        )}
      </div>
    </div>
  );
}
