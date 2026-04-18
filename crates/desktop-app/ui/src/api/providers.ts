import { apiFetch } from './bootstrap'

export type ProviderKind = 'OpenAI' | 'Anthropic' | 'Ollama' | string
export type AuthMethod = 'ApiKey' | 'OAuth' | string

export type ProviderProfile = {
  id: string
  name: string
  provider_kind: ProviderKind
  auth_method: AuthMethod
  default_model: string
  base_url?: string | null
}

export type ModelInfo = {
  id?: string
  name?: string
  context_length?: number
  pricing?: unknown
  [key: string]: unknown
}

export async function listProfiles(): Promise<ProviderProfile[]> {
  const res = await apiFetch('/api/profiles')
  if (!res.ok) throw new Error(`profiles: ${res.status}`)
  const body = await res.json()
  return Array.isArray(body) ? (body as ProviderProfile[]) : []
}

export async function listModels(profileId: string): Promise<ModelInfo[]> {
  const res = await apiFetch(`/api/providers/${encodeURIComponent(profileId)}/models`)
  if (!res.ok) throw new Error(`models: ${res.status}`)
  const body = await res.json()
  if (Array.isArray(body)) return body as ModelInfo[]
  if (body && typeof body === 'object' && 'items' in body) {
    return (body.items as ModelInfo[]) ?? []
  }
  return []
}
