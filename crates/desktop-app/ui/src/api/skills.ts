import { apiFetch } from './bootstrap'

export type SkillRecord = {
  name: string
  description: string
  instructions: string
  path: string
  tools: string[]
  isBuiltIn: boolean
}

export async function listSkills(): Promise<SkillRecord[]> {
  const res = await apiFetch('/api/skills')
  if (!res.ok) throw new Error(`skills: ${res.status}`)
  const body = (await res.json()) as { items?: SkillRecord[] }
  return body.items ?? []
}
