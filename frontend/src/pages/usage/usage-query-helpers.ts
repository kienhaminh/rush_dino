import type { SessionUsageEntry, CostDailyEntry } from './usage-types';

// ─── CSV Export ───────────────────────────────────────────────────────────────

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

export function buildSessionsCsv(sessions: SessionUsageEntry[]): string {
  if (sessions.length === 0) return '';
  const headers = [
    'key',
    'label',
    'agentId',
    'channel',
    'model',
    'provider',
    'totalTokens',
    'totalCost',
    'input',
    'output',
    'cacheRead',
    'cacheWrite',
    'messages',
    'errors',
    'durationMs',
  ];
  const rows = sessions.map((s) => {
    const u = s.usage;
    return [
      s.key,
      s.label ?? '',
      s.agentId ?? '',
      s.channel ?? '',
      s.model ?? '',
      s.modelProvider ?? s.providerOverride ?? '',
      u?.totalTokens ?? 0,
      u?.totalCost ?? 0,
      u?.input ?? 0,
      u?.output ?? 0,
      u?.cacheRead ?? 0,
      u?.cacheWrite ?? 0,
      u?.messageCounts?.total ?? 0,
      u?.messageCounts?.errors ?? 0,
      u?.durationMs ?? 0,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

export function buildDailyCsv(daily: CostDailyEntry[]): string {
  if (daily.length === 0) return '';
  const headers = [
    'date',
    'totalTokens',
    'totalCost',
    'input',
    'output',
    'cacheRead',
    'cacheWrite',
  ];
  const rows = daily.map((d) =>
    [d.date, d.totalTokens, d.totalCost, d.input, d.output, d.cacheRead, d.cacheWrite]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

// ─── Filtering ────────────────────────────────────────────────────────────────

export function applyFilters(
  sessions: SessionUsageEntry[],
  filters: {
    search?: string;
    agent?: string;
    provider?: string;
    model?: string;
  },
): SessionUsageEntry[] {
  return sessions.filter((session) => {
    // Text search across key, label, agentId, model
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = [
        session.key,
        session.label,
        session.agentId,
        session.model,
        session.modelProvider,
        session.channel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.agent && session.agentId !== filters.agent) return false;
    if (
      filters.provider &&
      session.modelProvider !== filters.provider &&
      session.providerOverride !== filters.provider
    )
      return false;
    if (filters.model && session.model !== filters.model) return false;
    return true;
  });
}

// ─── Unique option helpers ────────────────────────────────────────────────────

export function uniqueValues<T>(items: Array<T | undefined | null>, max = 20): string[] {
  const set = new Set<string>();
  for (const item of items) {
    if (item != null && String(item)) set.add(String(item));
  }
  return Array.from(set).slice(0, max);
}
