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

export type ProviderVerifyResponse = {
  ok: boolean
  source: string
  message: string
  modelCount: number
}

export type OAuthStartResponse = {
  session_id: string
  auth_url: string
}

export type CreateProfileInput = {
  name: string
  provider_kind: 'openai' | 'anthropic' | 'ollama'
  auth_method: 'apikey' | 'oauth' | 'none'
  default_model: string
  base_url?: string | null
  api_key?: string
}

export async function listProfiles(): Promise<ProviderProfile[]> {
  const res = await apiFetch('/api/profiles')
  if (!res.ok) throw new Error(`profiles: ${res.status}`)
  const body = await res.json()
  return Array.isArray(body) ? (body as ProviderProfile[]) : []
}

export async function createProfile(input: CreateProfileInput): Promise<ProviderProfile> {
  const res = await apiFetch('/api/profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`createProfile ${res.status}: ${text}`)
  }
  return (await res.json()) as ProviderProfile
}

export async function deleteProfile(profileId: string): Promise<void> {
  const res = await apiFetch(`/api/profiles/${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`deleteProfile ${res.status}: ${text}`)
  }
}

export async function verifyProfile(profileId: string): Promise<ProviderVerifyResponse> {
  const res = await apiFetch(`/api/providers/${encodeURIComponent(profileId)}/verify`)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`verifyProfile ${res.status}: ${text}`)
  }
  return (await res.json()) as ProviderVerifyResponse
}

export async function startProfileOAuth(profileId: string): Promise<OAuthStartResponse> {
  const res = await apiFetch(`/api/providers/${encodeURIComponent(profileId)}/connect-oauth/start`, {
    method: 'POST',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`startProfileOAuth ${res.status}: ${text}`)
  }
  return (await res.json()) as OAuthStartResponse
}

export async function completeProfileOAuth(
  profileId: string,
  sessionId: string,
  redirectUrl: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/providers/${encodeURIComponent(profileId)}/connect-oauth/complete`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        redirect_url: redirectUrl,
      }),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`completeProfileOAuth ${res.status}: ${text}`)
  }
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
