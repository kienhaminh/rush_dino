import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { UsageHeader } from './usage-header';
import { UsageInsights } from './usage-insights';
import { UsageDailyChart } from './usage-daily-chart';
import { UsageCostBreakdown } from './usage-cost-breakdown';
import { UsageSessionsCard } from './usage-sessions-card';
import { UsageSessionDetail } from './usage-session-detail';
import { UsageActivityMosaic } from './usage-activity-mosaic';
import { applyFilters } from './usage-query-helpers';
import {
  buildAggregatesFromSessions,
  computeSessionTotals,
  formatIsoDate,
} from './usage-metrics-helpers';
import type {
  SessionUsageEntry,
  CostDailyEntry,
  ChartMode,
  DailyChartMode,
  SessionSort,
  SortDir,
  TimeZone,
} from './usage-types';
import { fetchUsageMetrics } from '@/lib/api';
import type { UsageMetricsResponse, UsageMetricRow } from '@/lib/types';

// ─── API → Frontend type mappers ──────────────────────────────────────────────

function mapApiToSessions(response: UsageMetricsResponse): SessionUsageEntry[] {
  // Group raw rows by conversationId
  const groups = new Map<string, UsageMetricRow[]>();
  for (const row of response.items) {
    const arr = groups.get(row.conversationId) ?? [];
    arr.push(row);
    groups.set(row.conversationId, arr);
  }

  return Array.from(groups.entries()).map(([conversationId, rows]) => {
    const sortedRows = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const promptTokens = rows.reduce((sum, r) => sum + r.promptTokens, 0);
    const completionTokens = rows.reduce((sum, r) => sum + r.completionTokens, 0);
    const totalTokens = rows.reduce((sum, r) => sum + r.totalTokens, 0);
    const firstRow = sortedRows[0];
    const lastRow = sortedRows[sortedRows.length - 1];

    // Aggregate per model (including cost)
    const modelMap = new Map<
      string,
      { provider: string; model: string; count: number; tokens: number; cost: number }
    >();
    for (const row of rows) {
      const key = `${row.provider}::${row.model}`;
      const existing = modelMap.get(key) ?? {
        provider: row.provider,
        model: row.model,
        count: 0,
        tokens: 0,
        cost: 0,
      };
      existing.count += 1;
      existing.tokens += row.totalTokens;
      existing.cost += row.totalCost;
      modelMap.set(key, existing);
    }

    // Daily breakdown from individual rows (with cost)
    const dailyMap = new Map<string, { tokens: number; cost: number }>();
    for (const row of rows) {
      const date = row.createdAt.slice(0, 10);
      const prev = dailyMap.get(date) ?? { tokens: 0, cost: 0 };
      dailyMap.set(date, { tokens: prev.tokens + row.totalTokens, cost: prev.cost + row.totalCost });
    }

    const totalCost = rows.reduce((sum, r) => sum + r.totalCost, 0);
    const inputCost = rows.reduce((sum, r) => sum + r.inputCost, 0);
    const outputCost = rows.reduce((sum, r) => sum + r.outputCost, 0);

    const dominantModel = [...modelMap.values()].sort((a, b) => b.tokens - a.tokens)[0];

    return {
      key: conversationId,
      label: conversationId,
      model: dominantModel?.model,
      modelProvider: dominantModel?.provider,
      updatedAt: new Date(lastRow.createdAt).getTime(),
      usage: {
        input: promptTokens,
        output: completionTokens,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens,
        totalCost,
        inputCost,
        outputCost,
        cacheReadCost: 0,
        cacheWriteCost: 0,
        firstActivity: new Date(firstRow.createdAt).getTime(),
        lastActivity: new Date(lastRow.createdAt).getTime(),
        durationMs:
          new Date(lastRow.createdAt).getTime() - new Date(firstRow.createdAt).getTime(),
        activityDates: [...dailyMap.keys()].sort(),
        dailyBreakdown: [...dailyMap.entries()]
          .map(([date, { tokens, cost }]) => ({ date, tokens, cost }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        modelUsage: [...modelMap.values()].map((m) => ({
          provider: m.provider,
          model: m.model,
          count: m.count,
          totals: { totalTokens: m.tokens, totalCost: m.cost },
        })),
      },
    } satisfies SessionUsageEntry;
  });
}

function mapApiToDaily(response: UsageMetricsResponse): CostDailyEntry[] {
  return response.daily.map((entry) => {
    return {
      date: entry.date,
      input: entry.totals.promptTokens,
      output: entry.totals.completionTokens,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: entry.totals.totalTokens,
      totalCost: entry.totals.totalCost,
      inputCost: entry.totals.inputCost,
      outputCost: entry.totals.outputCost,
    };
  });
}

// ─── UsageTab ─────────────────────────────────────────────────────────────────

function UsageTab() {
  // Date range
  const today = formatIsoDate(new Date());
  const thirtyDaysAgo = formatIsoDate(new Date(Date.now() - 30 * 86400000));
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);

  // Filters
  const [filters, setFilters] = useState<{
    search?: string;
    agent?: string;
    provider?: string;
    model?: string;
  }>({});

  // Chart settings
  const [chartMode, setChartMode] = useState<ChartMode>('tokens');
  const [dailyChartMode, setDailyChartMode] = useState<DailyChartMode>('total');
  const [timeZone, setTimeZone] = useState<TimeZone>('local');

  // Selection state
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [selectedHours, setSelectedHours] = useState<number[]>([]);

  // Session list controls
  const [sessionSort, setSessionSort] = useState<SessionSort>('cost');
  const [sessionSortDir, setSessionSortDir] = useState<SortDir>('desc');

  // Data state
  const [allSessions, setAllSessions] = useState<SessionUsageEntry[]>([]);
  const [daily, setDaily] = useState<CostDailyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Fetch usage data whenever date range or refresh is triggered
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchUsageMetrics({ start: startDate, end: endDate })
      .then((response) => {
        if (!cancelled) {
          setAllSessions(mapApiToSessions(response));
          setDaily(mapApiToDaily(response));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load usage data');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, refreshCounter]);

  const handleRefresh = useCallback(() => setRefreshCounter((c) => c + 1), []);

  // Apply filters
  const filteredSessions = useMemo(() => applyFilters(allSessions, filters), [allSessions, filters]);

  // Compute totals and aggregates
  const totals = useMemo(() => computeSessionTotals(filteredSessions), [filteredSessions]);
  const aggregates = useMemo(
    () => buildAggregatesFromSessions(filteredSessions),
    [filteredSessions],
  );

  // Selected session entry for detail
  const selectedSession =
    selectedSessionIds.length === 1
      ? (filteredSessions.find((s) => s.key === selectedSessionIds[0]) ?? null)
      : null;

  const handleSelectSession = (key: string, shiftKey: boolean) => {
    setSelectedSessionIds((prev) => {
      if (shiftKey) {
        return prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      }
      return prev.includes(key) && prev.length === 1 ? [] : [key];
    });
  };

  const handleSelectDay = (day: string, shiftKey: boolean) => {
    setSelectedDays((prev) => {
      if (shiftKey) {
        return prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
      }
      return prev.includes(day) && prev.length === 1 ? [] : [day];
    });
  };

  const handleSelectHour = (hour: number, shiftKey: boolean) => {
    setSelectedHours((prev) => {
      if (shiftKey) {
        return prev.includes(hour) ? prev.filter((h) => h !== hour) : [...prev, hour];
      }
      return prev.includes(hour) && prev.length === 1 ? [] : [hour];
    });
  };

  return (
    <>
      <UsageHeader
        filters={filters}
        setFilters={setFilters}
        sessions={filteredSessions}
        filteredDaily={daily}
        totals={totals}
        sessionCount={filteredSessions.length}
        totalSessions={allSessions.length}
        loading={loading}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        chartMode={chartMode}
        onChartModeChange={setChartMode}
        timeZone={timeZone}
        onTimeZoneChange={setTimeZone}
        onRefresh={handleRefresh}
      />

      {error && (
        <div className="px-4 py-2 text-sm text-destructive bg-destructive/10 border-b border-destructive/20">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6 space-y-6">
          {/* Insights */}
          <UsageInsights
            totals={totals}
            aggregates={aggregates}
            sessions={filteredSessions}
            sessionCount={filteredSessions.length}
            totalSessions={allSessions.length}
          />

          {/* Activity mosaic */}
          <UsageActivityMosaic
            data={filteredSessions}
            timeZone={timeZone}
            selectedHours={selectedHours}
            onSelectHour={handleSelectHour}
          />

          {/* Main grid: chart + sessions + detail */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: daily chart + cost breakdown */}
            <div className="col-span-1 lg:col-span-8 space-y-6">
              <UsageDailyChart
                data={daily}
                selectedDays={selectedDays}
                chartMode={chartMode}
                dailyChartMode={dailyChartMode}
                onDailyChartModeChange={setDailyChartMode}
                onSelectDay={handleSelectDay}
              />

              <UsageCostBreakdown totals={totals} chartMode={chartMode} />

              {/* Session detail (mobile: below sessions card) */}
              <div className="lg:hidden">
                <UsageSessionDetail
                  session={selectedSession}
                  onClose={selectedSession ? () => setSelectedSessionIds([]) : undefined}
                />
              </div>
            </div>

            {/* Right: sessions list */}
            <div className="col-span-1 lg:col-span-4 space-y-4">
              <div className="lg:sticky lg:top-0" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                <div className="flex flex-col gap-4 h-full">
                  <div className="flex-1 min-h-0" style={{ height: 480 }}>
                    <UsageSessionsCard
                      sessions={filteredSessions}
                      selectedIds={selectedSessionIds}
                      selectedDays={selectedDays}
                      chartMode={chartMode}
                      sessionSort={sessionSort}
                      sessionSortDir={sessionSortDir}
                      onSelect={handleSelectSession}
                      onSortChange={setSessionSort}
                      onSortDirChange={setSessionSortDir}
                      onClearSelection={() => setSelectedSessionIds([])}
                      totalSessions={allSessions.length}
                    />
                  </div>

                  {/* Detail panel (desktop: sticky alongside sessions) */}
                  {selectedSession && (
                    <div className="hidden lg:block">
                      <UsageSessionDetail
                        session={selectedSession}
                        onClose={() => setSelectedSessionIds([])}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── MetricsPage ──────────────────────────────────────────────────────────────

export function MetricsPage() {
  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-background">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <UsageTab />
      </div>
    </div>
  );
}

export default MetricsPage;
