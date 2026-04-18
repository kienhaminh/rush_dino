import { apiFetch } from './bootstrap'

export type AppConfigJson = {
  host?: string
  port?: number
  log_level?: string
  active_provider?: string
  default_profile_id?: string | null
  data_dir?: string
  db_path?: string
  brave_search_endpoint?: string
  gateway?: Record<string, GatewayChannelConfig>
  security?: Record<string, unknown>
  execution?: Record<string, unknown>
  agent?: Record<string, unknown>
  knowledge_graph?: Record<string, unknown>
  mcp_servers?: Array<Record<string, unknown>>
  bootstrap?: Record<string, unknown>
  profiles?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export type GatewayChannelConfig = {
  enabled?: boolean
  [key: string]: unknown
}

export type CredentialsJson = {
  openai_api_key?: string
  anthropic_api_key?: string
  gemini_api_key?: string
  brave_api_key?: string
  telegram_bot_token?: string
  discord_bot_token?: string
  slack_bot_token?: string
  slack_app_token?: string
  api_secret?: string
  knowledge_graph?: Record<string, unknown>
  profiles?: Record<string, unknown>
  [key: string]: unknown
}

export async function getConfig(): Promise<AppConfigJson> {
  const res = await apiFetch('/api/config')
  if (!res.ok) throw new Error(`config: ${res.status}`)
  return (await res.json()) as AppConfigJson
}

export async function getCredentials(): Promise<CredentialsJson> {
  const res = await apiFetch('/api/credentials')
  if (!res.ok) throw new Error(`credentials: ${res.status}`)
  return (await res.json()) as CredentialsJson
}

/** PATCH credentials. Skip any field whose value is "***" — the server
 *  treats that as "don't touch". Our UI mirrors that convention. */
export async function patchCredentials(patch: CredentialsJson): Promise<CredentialsJson> {
  const res = await apiFetch('/api/credentials', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`credentials.patch ${res.status}: ${text}`)
  }
  return (await res.json()) as CredentialsJson
}
