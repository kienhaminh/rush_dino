import React, { useState, useMemo } from 'react';
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

// ─── Mock data ────────────────────────────────────────────────────────────────

function makeDate(daysAgo: number): number {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
}

const MOCK_SESSIONS: SessionUsageEntry[] = [
  {
    key: 'agent:main:cron-report-2024',
    label: 'Generate Weekly Report',
    agentId: 'main',
    channel: 'cron',
    model: 'gpt-4o',
    modelProvider: 'openai',
    updatedAt: makeDate(0),
    usage: {
      input: 2800,
      output: 1400,
      cacheRead: 600,
      cacheWrite: 200,
      totalTokens: 5000,
      totalCost: 0.045,
      inputCost: 0.028,
      outputCost: 0.014,
      cacheReadCost: 0.002,
      cacheWriteCost: 0.001,
      firstActivity: makeDate(0) - 3000,
      lastActivity: makeDate(0),
      durationMs: 2500,
      activityDates: [formatIsoDate(new Date())],
      dailyBreakdown: [{ date: formatIsoDate(new Date()), tokens: 5000, cost: 0.045 }],
      messageCounts: { total: 12, user: 4, assistant: 4, toolCalls: 3, toolResults: 3, errors: 0 },
      toolUsage: {
        totalCalls: 3,
        uniqueTools: 2,
        tools: [
          { name: 'bash', count: 2 },
          { name: 'read_file', count: 1 },
        ],
      },
      modelUsage: [
        {
          provider: 'openai',
          model: 'gpt-4o',
          count: 8,
          totals: { input: 2800, output: 1400, totalTokens: 5000, totalCost: 0.045 },
        },
      ],
      latency: { count: 8, avgMs: 480, minMs: 120, maxMs: 1200, p95Ms: 1100 },
    },
  },
  {
    key: 'agent:beta:analyze-data-q3',
    label: 'Analyze Q3 Sales Data',
    agentId: 'beta',
    channel: 'user',
    model: 'claude-3-5-sonnet-20241022',
    modelProvider: 'anthropic',
    updatedAt: makeDate(1),
    usage: {
      input: 4800,
      output: 1600,
      cacheRead: 3200,
      cacheWrite: 400,
      totalTokens: 10000,
      totalCost: 0.082,
      inputCost: 0.048,
      outputCost: 0.024,
      cacheReadCost: 0.006,
      cacheWriteCost: 0.004,
      firstActivity: makeDate(1) - 5100,
      lastActivity: makeDate(1),
      durationMs: 5100,
      activityDates: [formatIsoDate(new Date(Date.now() - 86400000))],
      dailyBreakdown: [
        { date: formatIsoDate(new Date(Date.now() - 86400000)), tokens: 10000, cost: 0.082 },
      ],
      messageCounts: { total: 22, user: 8, assistant: 8, toolCalls: 5, toolResults: 5, errors: 1 },
      toolUsage: {
        totalCalls: 5,
        uniqueTools: 3,
        tools: [
          { name: 'bash', count: 3 },
          { name: 'read_file', count: 1 },
          { name: 'write_file', count: 1 },
        ],
      },
      modelUsage: [
        {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          count: 16,
          totals: { input: 4800, output: 1600, totalTokens: 10000, totalCost: 0.082 },
        },
      ],
      latency: { count: 16, avgMs: 620, minMs: 180, maxMs: 1800, p95Ms: 1650 },
    },
  },
  {
    key: 'agent:alpha:refactor-auth',
    label: 'Refactor Auth Module',
    agentId: 'alpha',
    channel: 'user',
    model: 'gpt-4o',
    modelProvider: 'openai',
    updatedAt: makeDate(2),
    usage: {
      input: 8200,
      output: 3600,
      cacheRead: 1400,
      cacheWrite: 800,
      totalTokens: 14000,
      totalCost: 0.12,
      inputCost: 0.082,
      outputCost: 0.036,
      cacheReadCost: 0.001,
      cacheWriteCost: 0.001,
      firstActivity: makeDate(2) - 8400,
      lastActivity: makeDate(2),
      durationMs: 8400,
      activityDates: [formatIsoDate(new Date(Date.now() - 172800000))],
      dailyBreakdown: [
        { date: formatIsoDate(new Date(Date.now() - 172800000)), tokens: 14000, cost: 0.12 },
      ],
      messageCounts: {
        total: 34,
        user: 10,
        assistant: 12,
        toolCalls: 9,
        toolResults: 9,
        errors: 3,
      },
      toolUsage: {
        totalCalls: 9,
        uniqueTools: 4,
        tools: [
          { name: 'bash', count: 4 },
          { name: 'read_file', count: 2 },
          { name: 'write_file', count: 2 },
          { name: 'search', count: 1 },
        ],
      },
      modelUsage: [
        {
          provider: 'openai',
          model: 'gpt-4o',
          count: 22,
          totals: { input: 8200, output: 3600, totalTokens: 14000, totalCost: 0.12 },
        },
      ],
      latency: { count: 22, avgMs: 720, minMs: 200, maxMs: 2400, p95Ms: 2200 },
    },
  },
  {
    key: 'agent:gamma:write-tests',
    label: 'Write Unit Tests',
    agentId: 'gamma',
    channel: 'cron',
    model: 'claude-3-5-haiku-20241022',
    modelProvider: 'anthropic',
    updatedAt: makeDate(3),
    usage: {
      input: 1600,
      output: 800,
      cacheRead: 400,
      cacheWrite: 200,
      totalTokens: 3000,
      totalCost: 0.018,
      inputCost: 0.016,
      outputCost: 0.008,
      cacheReadCost: 0.0005,
      cacheWriteCost: 0.0005,
      firstActivity: makeDate(3) - 2100,
      lastActivity: makeDate(3),
      durationMs: 2100,
      activityDates: [formatIsoDate(new Date(Date.now() - 259200000))],
      dailyBreakdown: [
        { date: formatIsoDate(new Date(Date.now() - 259200000)), tokens: 3000, cost: 0.018 },
      ],
      messageCounts: { total: 8, user: 2, assistant: 3, toolCalls: 2, toolResults: 2, errors: 0 },
      toolUsage: {
        totalCalls: 2,
        uniqueTools: 2,
        tools: [
          { name: 'read_file', count: 1 },
          { name: 'write_file', count: 1 },
        ],
      },
      modelUsage: [
        {
          provider: 'anthropic',
          model: 'claude-3-5-haiku-20241022',
          count: 5,
          totals: { input: 1600, output: 800, totalTokens: 3000, totalCost: 0.018 },
        },
      ],
      latency: { count: 5, avgMs: 320, minMs: 80, maxMs: 600, p95Ms: 580 },
    },
  },
];

// Generate mock daily data for the last 14 days
function buildMockDailyData(): CostDailyEntry[] {
  const entries: CostDailyEntry[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = formatIsoDate(d);
    const factor = 0.3 + Math.sin(i * 0.8) * 0.3 + Math.random() * 0.4;
    const baseTokens = Math.round(8000 * factor);
    const input = Math.round(baseTokens * 0.45);
    const output = Math.round(baseTokens * 0.35);
    const cacheRead = Math.round(baseTokens * 0.12);
    const cacheWrite = Math.round(baseTokens * 0.08);
    const totalCost = baseTokens * 0.00001;
    entries.push({
      date: dateStr,
      input,
      output,
      cacheRead,
      cacheWrite,
      totalTokens: input + output + cacheRead + cacheWrite,
      totalCost,
      inputCost: input * 0.0000075,
      outputCost: output * 0.000015,
      cacheReadCost: cacheRead * 0.00000375,
      cacheWriteCost: cacheWrite * 0.00001875,
    });
  }
  return entries;
}

const MOCK_DAILY = buildMockDailyData();

// ─── UsagePage ────────────────────────────────────────────────────────────────

export function UsagePage() {
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

  // Loading simulation
  const [loading, setLoading] = useState(false);

  // Filtered sessions
  const filteredSessions = useMemo(() => applyFilters(MOCK_SESSIONS, filters), [filters]);

  // Compute totals and aggregates
  const totals = useMemo(() => computeSessionTotals(filteredSessions), [filteredSessions]);
  const aggregates = useMemo(
    () => buildAggregatesFromSessions(filteredSessions),
    [filteredSessions],
  );

  // Daily chart data (filtered to date range in real impl)
  const filteredDaily = MOCK_DAILY;

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
      // Single select: toggle
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

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 800);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-background">
      <UsageHeader
        filters={filters}
        setFilters={setFilters}
        sessions={filteredSessions}
        filteredDaily={filteredDaily}
        totals={totals}
        sessionCount={filteredSessions.length}
        totalSessions={MOCK_SESSIONS.length}
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

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6 space-y-6">
          {/* Insights */}
          <UsageInsights
            totals={totals}
            aggregates={aggregates}
            sessions={filteredSessions}
            sessionCount={filteredSessions.length}
            totalSessions={MOCK_SESSIONS.length}
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
                data={filteredDaily}
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
                      totalSessions={MOCK_SESSIONS.length}
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
    </div>
  );
}

export default UsagePage;
