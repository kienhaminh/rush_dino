import { apiFetch } from './bootstrap'

export type ThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'adaptive'

export type PatchThinkingLevelResponse = {
  level: ThinkingLevel
}

export type SystemSummary = {
  status: string
  activeProvider?: string
  effectiveProfileId?: string | null
  defaultProfileId?: string | null
  runtimeUnavailableError?: string | null
  profilesCount?: number
  uptimeSecs?: number
  agentConfig?: {
    thinkingLevel?: ThinkingLevel
    maxIterations?: number
    maxContextTokens?: number
  } | null
}

export type DoctorSummary = {
  errorCount: number
  warnCount: number
  infoCount: number
}

export type DoctorFinding = {
  code: string
  severity: string
  title: string
  detail: string
  action: string
  fixable: boolean
}

export type DoctorReport = {
  generatedAt: string
  status: string
  summary: DoctorSummary
  findings: DoctorFinding[]
}

export async function patchThinkingLevel(
  level: ThinkingLevel,
): Promise<PatchThinkingLevelResponse> {
  const res = await apiFetch('/api/system/thinking-level', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ level }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`patchThinkingLevel ${res.status}: ${text}`)
  }
  return (await res.json()) as PatchThinkingLevelResponse
}

export async function getSystemSummary(): Promise<SystemSummary> {
  const res = await apiFetch('/api/system/summary')
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`system.summary ${res.status}: ${text}`)
  }
  return (await res.json()) as SystemSummary
}

export async function getDoctorReport(): Promise<DoctorReport> {
  const res = await apiFetch('/api/system/doctor')
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`system.doctor ${res.status}: ${text}`)
  }
  return (await res.json()) as DoctorReport
}
