import type { UsageTotals, UsageAggregates, SessionUsageEntry, ChartMode } from './usage-types';

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function formatCost(n: number, decimals = 2): string {
  return `$${n.toFixed(decimals)}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDayLabel(dateStr: string): string {
  const date = parseYmdDate(dateStr);
  if (!date) return dateStr;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function formatFullDate(dateStr: string): string {
  const date = parseYmdDate(dateStr);
  if (!date) return dateStr;
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatHourLabel(hour: number): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric' });
}

function parseYmdDate(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return Number.isNaN(date.valueOf()) ? null : date;
}

// ─── Totals ───────────────────────────────────────────────────────────────────

export function emptyUsageTotals(): UsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    totalCost: 0,
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    cacheWriteCost: 0,
    missingCostEntries: 0,
  };
}

export function mergeUsageTotals(target: UsageTotals, source: Partial<UsageTotals>): void {
  target.input += source.input ?? 0;
  target.output += source.output ?? 0;
  target.cacheRead += source.cacheRead ?? 0;
  target.cacheWrite += source.cacheWrite ?? 0;
  target.totalTokens += source.totalTokens ?? 0;
  target.totalCost += source.totalCost ?? 0;
  target.inputCost += source.inputCost ?? 0;
  target.outputCost += source.outputCost ?? 0;
  target.cacheReadCost += source.cacheReadCost ?? 0;
  target.cacheWriteCost += source.cacheWriteCost ?? 0;
  target.missingCostEntries += source.missingCostEntries ?? 0;
}

export function computeSessionTotals(sessions: SessionUsageEntry[]): UsageTotals {
  return sessions.reduce((acc, s) => {
    if (s.usage) mergeUsageTotals(acc, s.usage);
    return acc;
  }, emptyUsageTotals());
}

// ─── Time utilities ───────────────────────────────────────────────────────────

export function getZonedHour(date: Date, zone: 'local' | 'utc'): number {
  return zone === 'utc' ? date.getUTCHours() : date.getHours();
}

export function getZonedWeekday(date: Date, zone: 'local' | 'utc'): number {
  return zone === 'utc' ? date.getUTCDay() : date.getDay();
}

export function setToHourEnd(date: Date, zone: 'local' | 'utc'): Date {
  const next = new Date(date);
  if (zone === 'utc') {
    next.setUTCMinutes(59, 59, 999);
  } else {
    next.setMinutes(59, 59, 999);
  }
  return next;
}

// ─── Cost breakdown ───────────────────────────────────────────────────────────

export function pct(part: number, total: number): number {
  return total === 0 ? 0 : (part / total) * 100;
}

export function getCostBreakdown(totals: UsageTotals) {
  const totalCost = totals.totalCost || 0;
  return {
    input: {
      tokens: totals.input,
      cost: totals.inputCost || 0,
      pct: pct(totals.inputCost || 0, totalCost),
    },
    output: {
      tokens: totals.output,
      cost: totals.outputCost || 0,
      pct: pct(totals.outputCost || 0, totalCost),
    },
    cacheRead: {
      tokens: totals.cacheRead,
      cost: totals.cacheReadCost || 0,
      pct: pct(totals.cacheReadCost || 0, totalCost),
    },
    cacheWrite: {
      tokens: totals.cacheWrite,
      cost: totals.cacheWriteCost || 0,
      pct: pct(totals.cacheWriteCost || 0, totalCost),
    },
    totalCost,
  };
}

// ─── Aggregates ───────────────────────────────────────────────────────────────

export function buildAggregatesFromSessions(sessions: SessionUsageEntry[]): UsageAggregates {
  const messages = { total: 0, user: 0, assistant: 0, toolCalls: 0, toolResults: 0, errors: 0 };
  const toolMap = new Map<string, number>();
  const modelMap = new Map<
    string,
    { provider?: string; model?: string; count: number; totals: UsageTotals }
  >();
  const providerMap = new Map<
    string,
    { provider?: string; model?: string; count: number; totals: UsageTotals }
  >();
  const agentMap = new Map<string, UsageTotals>();
  const channelMap = new Map<string, UsageTotals>();
  const dailyMap = new Map<
    string,
    {
      date: string;
      tokens: number;
      cost: number;
      messages: number;
      toolCalls: number;
      errors: number;
    }
  >();

  for (const session of sessions) {
    const usage = session.usage;
    if (!usage) continue;

    if (usage.messageCounts) {
      messages.total += usage.messageCounts.total;
      messages.user += usage.messageCounts.user;
      messages.assistant += usage.messageCounts.assistant;
      messages.toolCalls += usage.messageCounts.toolCalls;
      messages.toolResults += usage.messageCounts.toolResults;
      messages.errors += usage.messageCounts.errors;
    }

    if (usage.toolUsage) {
      for (const tool of usage.toolUsage.tools) {
        toolMap.set(tool.name, (toolMap.get(tool.name) ?? 0) + tool.count);
      }
    }

    if (usage.modelUsage) {
      for (const entry of usage.modelUsage) {
        const modelKey = `${entry.provider ?? 'unknown'}::${entry.model ?? 'unknown'}`;
        const modelExisting = modelMap.get(modelKey) ?? {
          provider: entry.provider,
          model: entry.model,
          count: 0,
          totals: emptyUsageTotals(),
        };
        modelExisting.count += entry.count;
        mergeUsageTotals(modelExisting.totals, entry.totals);
        modelMap.set(modelKey, modelExisting);

        const providerKey = entry.provider ?? 'unknown';
        const providerExisting = providerMap.get(providerKey) ?? {
          provider: entry.provider,
          count: 0,
          totals: emptyUsageTotals(),
        };
        providerExisting.count += entry.count;
        mergeUsageTotals(providerExisting.totals, entry.totals);
        providerMap.set(providerKey, providerExisting);
      }
    }

    if (session.agentId) {
      const totals = agentMap.get(session.agentId) ?? emptyUsageTotals();
      mergeUsageTotals(totals, usage);
      agentMap.set(session.agentId, totals);
    }

    if (session.channel) {
      const totals = channelMap.get(session.channel) ?? emptyUsageTotals();
      mergeUsageTotals(totals, usage);
      channelMap.set(session.channel, totals);
    }

    for (const day of usage.dailyBreakdown ?? []) {
      const daily = dailyMap.get(day.date) ?? {
        date: day.date,
        tokens: 0,
        cost: 0,
        messages: 0,
        toolCalls: 0,
        errors: 0,
      };
      daily.tokens += day.tokens;
      daily.cost += day.cost;
      dailyMap.set(day.date, daily);
    }

    for (const day of usage.dailyMessageCounts ?? []) {
      const daily = dailyMap.get(day.date) ?? {
        date: day.date,
        tokens: 0,
        cost: 0,
        messages: 0,
        toolCalls: 0,
        errors: 0,
      };
      daily.messages += day.total;
      daily.toolCalls += day.toolCalls;
      daily.errors += day.errors;
      dailyMap.set(day.date, daily);
    }
  }

  return {
    messages,
    tools: {
      totalCalls: Array.from(toolMap.values()).reduce((sum, count) => sum + count, 0),
      uniqueTools: toolMap.size,
      tools: Array.from(toolMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    },
    byModel: Array.from(modelMap.values()).sort(
      (a, b) => (b.totals.totalCost ?? 0) - (a.totals.totalCost ?? 0),
    ),
    byProvider: Array.from(providerMap.values()).sort(
      (a, b) => (b.totals.totalCost ?? 0) - (a.totals.totalCost ?? 0),
    ),
    byAgent: Array.from(agentMap.entries())
      .map(([agentId, totals]) => ({ agentId, totals }))
      .sort((a, b) => (b.totals.totalCost ?? 0) - (a.totals.totalCost ?? 0)),
    byChannel: Array.from(channelMap.entries())
      .map(([channel, totals]) => ({ channel, totals }))
      .sort((a, b) => (b.totals.totalCost ?? 0) - (a.totals.totalCost ?? 0)),
    daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ─── Insight stats ────────────────────────────────────────────────────────────

export type UsageInsightStats = {
  durationSumMs: number;
  durationCount: number;
  avgDurationMs: number;
  throughputTokensPerMin?: number;
  throughputCostPerMin?: number;
  errorRate: number;
};

export function buildUsageInsightStats(
  sessions: SessionUsageEntry[],
  totals: UsageTotals | null,
  aggregates: UsageAggregates,
): UsageInsightStats {
  let durationSumMs = 0;
  let durationCount = 0;
  for (const session of sessions) {
    const duration = session.usage?.durationMs ?? 0;
    if (duration > 0) {
      durationSumMs += duration;
      durationCount += 1;
    }
  }

  const avgDurationMs = durationCount ? durationSumMs / durationCount : 0;
  const throughputTokensPerMin =
    totals && durationSumMs > 0 ? (totals.totalTokens / durationSumMs) * 60000 : undefined;
  const throughputCostPerMin =
    totals && durationSumMs > 0 ? (totals.totalCost / durationSumMs) * 60000 : undefined;
  const errorRate = aggregates.messages.total
    ? aggregates.messages.errors / aggregates.messages.total
    : 0;

  return {
    durationSumMs,
    durationCount,
    avgDurationMs,
    throughputTokensPerMin,
    throughputCostPerMin,
    errorRate,
  };
}

// ─── Mosaic stats ─────────────────────────────────────────────────────────────

export type UsageMosaicStats = {
  hasData: boolean;
  totalTokens: number;
  hourTotals: number[];
  weekdayTotals: Array<{ label: string; tokens: number }>;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildUsageMosaicStats(
  sessions: SessionUsageEntry[],
  timeZone: 'local' | 'utc',
): UsageMosaicStats {
  const hourTotals = Array.from({ length: 24 }, () => 0);
  const weekdayTotals = Array.from({ length: 7 }, () => 0);
  let totalTokens = 0;
  let hasData = false;

  for (const session of sessions) {
    const usage = session.usage;
    if (!usage || !usage.totalTokens || usage.totalTokens <= 0) continue;
    totalTokens += usage.totalTokens;

    const start = usage.firstActivity ?? session.updatedAt;
    const end = usage.lastActivity ?? session.updatedAt;
    if (!start || !end) continue;
    hasData = true;

    const startMs = Math.min(start, end);
    const endMs = Math.max(start, end);
    const durationMs = Math.max(endMs - startMs, 1);
    const totalMinutes = durationMs / 60000;

    let cursor = startMs;
    while (cursor < endMs) {
      const date = new Date(cursor);
      const hour = getZonedHour(date, timeZone);
      const weekday = getZonedWeekday(date, timeZone);
      const nextHour = setToHourEnd(date, timeZone);
      const nextMs = Math.min(nextHour.getTime(), endMs);
      const minutes = Math.max((nextMs - cursor) / 60000, 0);
      const share = minutes / totalMinutes;
      hourTotals[hour] += usage.totalTokens * share;
      weekdayTotals[weekday] += usage.totalTokens * share;
      cursor = nextMs + 1;
    }
  }

  return {
    hasData,
    totalTokens,
    hourTotals,
    weekdayTotals: WEEKDAYS.map((label, index) => ({ label, tokens: weekdayTotals[index] })),
  };
}

// ─── Peak error hours ─────────────────────────────────────────────────────────

export function buildPeakErrorHours(
  sessions: SessionUsageEntry[],
  timeZone: 'local' | 'utc',
): Array<{ label: string; value: string; sub?: string }> {
  const hourErrors = Array.from({ length: 24 }, () => 0);
  const hourMsgs = Array.from({ length: 24 }, () => 0);

  for (const session of sessions) {
    const usage = session.usage;
    if (!usage?.messageCounts || usage.messageCounts.total === 0) continue;
    const start = usage.firstActivity ?? session.updatedAt;
    const end = usage.lastActivity ?? session.updatedAt;
    if (!start || !end) continue;

    const startMs = Math.min(start, end);
    const endMs = Math.max(start, end);
    const totalMinutes = Math.max(endMs - startMs, 1) / 60000;

    let cursor = startMs;
    while (cursor < endMs) {
      const date = new Date(cursor);
      const hour = getZonedHour(date, timeZone);
      const nextHour = setToHourEnd(date, timeZone);
      const nextMs = Math.min(nextHour.getTime(), endMs);
      const minutes = Math.max((nextMs - cursor) / 60000, 0);
      const share = minutes / totalMinutes;
      hourErrors[hour] += usage.messageCounts.errors * share;
      hourMsgs[hour] += usage.messageCounts.total * share;
      cursor = nextMs + 1;
    }
  }

  return hourMsgs
    .map((msgs, hour) => {
      const errors = hourErrors[hour];
      const rate = msgs > 0 ? errors / msgs : 0;
      return { hour, rate, errors, msgs };
    })
    .filter((e) => e.msgs > 0 && e.errors > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5)
    .map((e) => ({
      label: formatHourLabel(e.hour),
      value: `${(e.rate * 100).toFixed(2)}%`,
      sub: `${Math.round(e.errors)} errors · ${Math.round(e.msgs)} msgs`,
    }));
}

// ─── Session value helper (respects day filter) ───────────────────────────────

export function getSessionValue(
  session: SessionUsageEntry,
  selectedDays: string[],
  mode: ChartMode,
): number {
  const usage = session.usage;
  if (!usage) return 0;
  if (selectedDays.length > 0 && usage.dailyBreakdown && usage.dailyBreakdown.length > 0) {
    const filtered = usage.dailyBreakdown.filter((d) => selectedDays.includes(d.date));
    return mode === 'tokens'
      ? filtered.reduce((sum, d) => sum + d.tokens, 0)
      : filtered.reduce((sum, d) => sum + d.cost, 0);
  }
  return mode === 'tokens' ? (usage.totalTokens ?? 0) : (usage.totalCost ?? 0);
}
