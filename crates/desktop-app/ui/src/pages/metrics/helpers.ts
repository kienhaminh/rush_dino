import type { UsageTotals, UsageAggregates, SessionUsageEntry, CostDailyEntry, ChartMode } from './types'
import type { UsageMetricRow } from '@/api/metrics'

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

export function formatCost(n: number, decimals = 4): string {
  return `$${n.toFixed(decimals)}`
}

export function formatIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// ─── Empty totals ─────────────────────────────────────────────────────────────

export function emptyTotals(): UsageTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, totalCost: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0 }
}

export function mergeTotals(acc: UsageTotals, src: Partial<UsageTotals>): void {
  acc.input       += src.input       ?? 0
  acc.output      += src.output      ?? 0
  acc.cacheRead   += src.cacheRead   ?? 0
  acc.cacheWrite  += src.cacheWrite  ?? 0
  acc.totalTokens += src.totalTokens ?? 0
  acc.totalCost   += src.totalCost   ?? 0
  acc.inputCost   += src.inputCost   ?? 0
  acc.outputCost  += src.outputCost  ?? 0
  acc.cacheReadCost  += src.cacheReadCost  ?? 0
  acc.cacheWriteCost += src.cacheWriteCost ?? 0
}

export function computeTotals(sessions: SessionUsageEntry[]): UsageTotals {
  const acc = emptyTotals()
  for (const s of sessions) if (s.usage) mergeTotals(acc, s.usage)
  return acc
}

// ─── Aggregates ───────────────────────────────────────────────────────────────

export function buildAggregates(sessions: SessionUsageEntry[]): UsageAggregates {
  const modelMap = new Map<string, { model?: string; provider?: string; count: number; totals: UsageTotals }>()
  const providerMap = new Map<string, { provider?: string; count: number; totals: UsageTotals }>()
  const dailyMap = new Map<string, { date: string; tokens: number; cost: number }>()

  for (const s of sessions) {
    const u = s.usage
    if (!u) continue

    for (const m of u.modelUsage ?? []) {
      const key = `${m.provider}::${m.model}`
      const existing = modelMap.get(key) ?? { model: m.model, provider: m.provider, count: 0, totals: emptyTotals() }
      existing.count += m.count
      mergeTotals(existing.totals, m.totals)
      modelMap.set(key, existing)

      const pk = m.provider ?? 'unknown'
      const pe = providerMap.get(pk) ?? { provider: m.provider, count: 0, totals: emptyTotals() }
      pe.count += m.count
      mergeTotals(pe.totals, m.totals)
      providerMap.set(pk, pe)
    }

    for (const d of u.dailyBreakdown ?? []) {
      const e = dailyMap.get(d.date) ?? { date: d.date, tokens: 0, cost: 0 }
      e.tokens += d.tokens
      e.cost   += d.cost
      dailyMap.set(d.date, e)
    }
  }

  return {
    byModel: [...modelMap.values()].sort((a, b) => (b.totals.totalCost) - (a.totals.totalCost)),
    byProvider: [...providerMap.values()].sort((a, b) => (b.totals.totalCost) - (a.totals.totalCost)),
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }
}

// ─── API row → sessions ───────────────────────────────────────────────────────

export function mapRowsToSessions(rows: UsageMetricRow[]): SessionUsageEntry[] {
  const groups = new Map<string, UsageMetricRow[]>()
  for (const row of rows) {
    const arr = groups.get(row.conversationId) ?? []
    arr.push(row)
    groups.set(row.conversationId, arr)
  }

  return [...groups.entries()].map(([convId, rs]) => {
    const sorted = [...rs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const first = sorted[0]
    const last  = sorted[sorted.length - 1]

    const promptTokens     = rs.reduce((s, r) => s + (r.promptTokens ?? 0), 0)
    const completionTokens = rs.reduce((s, r) => s + (r.completionTokens ?? 0), 0)
    const totalTokens      = rs.reduce((s, r) => s + (r.totalTokens ?? 0), 0)
    const totalCost        = rs.reduce((s, r) => s + (r.totalCost ?? 0), 0)
    const inputCost        = rs.reduce((s, r) => s + (r.inputCost ?? 0), 0)
    const outputCost       = rs.reduce((s, r) => s + (r.outputCost ?? 0), 0)

    const modelMap = new Map<string, { provider: string; model: string; count: number; tokens: number; cost: number }>()
    for (const r of rs) {
      const k = `${r.provider}::${r.model}`
      const e = modelMap.get(k) ?? { provider: r.provider, model: r.model, count: 0, tokens: 0, cost: 0 }
      e.count++; e.tokens += r.totalTokens ?? 0; e.cost += r.totalCost ?? 0
      modelMap.set(k, e)
    }

    const dailyMap = new Map<string, { tokens: number; cost: number }>()
    for (const r of rs) {
      const date = r.createdAt.slice(0, 10)
      const e = dailyMap.get(date) ?? { tokens: 0, cost: 0 }
      e.tokens += r.totalTokens ?? 0; e.cost += r.totalCost ?? 0
      dailyMap.set(date, e)
    }

    const dominant = [...modelMap.values()].sort((a, b) => b.tokens - a.tokens)[0]

    return {
      key: convId,
      label: convId,
      model: dominant?.model,
      modelProvider: dominant?.provider,
      updatedAt: new Date(last.createdAt).getTime(),
      usage: {
        input: promptTokens,
        output: completionTokens,
        cacheRead: 0, cacheWrite: 0,
        totalTokens, totalCost, inputCost, outputCost,
        cacheReadCost: 0, cacheWriteCost: 0,
        firstActivity: new Date(first.createdAt).getTime(),
        lastActivity:  new Date(last.createdAt).getTime(),
        durationMs: new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime(),
        dailyBreakdown: [...dailyMap.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
        modelUsage: [...modelMap.values()].map(m => ({
          provider: m.provider, model: m.model, count: m.count,
          totals: { totalTokens: m.tokens, totalCost: m.cost },
        })),
      },
    } satisfies SessionUsageEntry
  })
}

export function mapRowsToDaily(rows: UsageMetricRow[]): CostDailyEntry[] {
  const map = new Map<string, CostDailyEntry>()
  for (const r of rows) {
    const date = r.createdAt.slice(0, 10)
    const e = map.get(date) ?? { date, input: 0, output: 0, totalTokens: 0, totalCost: 0, inputCost: 0, outputCost: 0 }
    e.input       += r.promptTokens     ?? 0
    e.output      += r.completionTokens ?? 0
    e.totalTokens += r.totalTokens      ?? 0
    e.totalCost   += r.totalCost        ?? 0
    e.inputCost   += r.inputCost        ?? 0
    e.outputCost  += r.outputCost       ?? 0
    map.set(date, e)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Activity mosaic ──────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export type MosaicStats = {
  hasData: boolean
  totalTokens: number
  hourTotals: number[]
  weekdayTotals: Array<{ label: string; tokens: number }>
}

function getHour(date: Date): number { return date.getHours() }
function getWeekday(date: Date): number { return date.getDay() }
function hourEnd(date: Date): Date {
  const d = new Date(date); d.setMinutes(59, 59, 999); return d
}

export function buildMosaicStats(sessions: SessionUsageEntry[]): MosaicStats {
  const hourTotals = Array.from({ length: 24 }, () => 0)
  const weekdayTotals = Array.from({ length: 7 }, () => 0)
  let totalTokens = 0
  let hasData = false

  for (const s of sessions) {
    const u = s.usage
    if (!u || !u.totalTokens || u.totalTokens <= 0) continue
    totalTokens += u.totalTokens

    const start = u.firstActivity ?? s.updatedAt
    const end   = u.lastActivity  ?? s.updatedAt
    if (!start || !end) continue
    hasData = true

    const startMs = Math.min(start, end)
    const endMs   = Math.max(start, end)
    const durationMs = Math.max(endMs - startMs, 1)
    const totalMinutes = durationMs / 60_000

    let cursor = startMs
    while (cursor < endMs) {
      const date    = new Date(cursor)
      const hour    = getHour(date)
      const weekday = getWeekday(date)
      const nextMs  = Math.min(hourEnd(date).getTime(), endMs)
      const minutes = Math.max((nextMs - cursor) / 60_000, 0)
      const share   = minutes / totalMinutes
      hourTotals[hour]       += u.totalTokens * share
      weekdayTotals[weekday] += u.totalTokens * share
      cursor = nextMs + 1
    }
  }

  return {
    hasData,
    totalTokens,
    hourTotals,
    weekdayTotals: WEEKDAYS.map((label, i) => ({ label, tokens: weekdayTotals[i] })),
  }
}

export function getSessionValue(s: SessionUsageEntry, selectedDays: string[], mode: ChartMode): number {
  const u = s.usage
  if (!u) return 0
  if (selectedDays.length > 0 && u.dailyBreakdown?.length) {
    const filtered = u.dailyBreakdown.filter(d => selectedDays.includes(d.date))
    return mode === 'tokens'
      ? filtered.reduce((sum, d) => sum + d.tokens, 0)
      : filtered.reduce((sum, d) => sum + d.cost, 0)
  }
  return mode === 'tokens' ? (u.totalTokens ?? 0) : (u.totalCost ?? 0)
}
