import { apiFetch } from './bootstrap'

/* ── Server types (mirror of crates/server/src/routes/{chat,conversations}.rs) */

export type Role = 'user' | 'assistant' | 'system' | 'tool'

export type ChatMessage = {
  id?: string
  role: Role
  content: string
  timestamp?: string
  tool_calls?: ToolCall[]
}

export type ToolCall = {
  id?: string
  name?: string
  arguments?: unknown
  result?: unknown
}

export type InputRequestFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'number'

export type InputFieldOption = {
  label: string
  value: string
}

export type InputFieldSpec = {
  name: string
  label: string
  description?: string
  type: InputRequestFieldType
  required?: boolean
  placeholder?: string
  defaultValue?: unknown
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  options?: InputFieldOption[]
  secret?: boolean
}

export type InputRequestSpec = {
  kind: 'question' | 'form'
  title: string
  description?: string
  submitLabel?: string
  cancelLabel?: string
  fields: InputFieldSpec[]
}

export type PendingInputRequest = {
  requestId: string
  sessionId: string
  conversationId: string
  runId?: string
  payload: {
    spec: InputRequestSpec
  }
  createdAt: string
}

export type InputRequestStatus = 'submitted' | 'cancelled'

export type ConversationSummary = {
  id: string
  title?: string
  updated_at?: string
  message_count?: number
}

export type ConversationDetail = {
  id: string
  title?: string
  messages: ChatMessage[]
  pendingInputRequests?: PendingInputRequest[]
  latestMetrics?: unknown
  activeRun?: unknown
}

export type ChatResponse = {
  run_id: string
  conversation_id: string
  content: string
  rich_content?: unknown
  finish_reason: string
  tool_calls: ToolCall[]
  status: 'completed' | 'pending_approval' | string
  pending_approval?: {
    request_id: string
    session_id: string
    tool: string
  }
}

/* ── API functions ────────────────────────────────────────────────────── */

export async function listConversations(): Promise<ConversationSummary[]> {
  const res = await apiFetch('/api/conversations')
  if (!res.ok) throw new Error(`listConversations: ${res.status}`)
  const body = (await res.json()) as { items?: ConversationSummary[] }
  return body.items ?? []
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const res = await apiFetch(`/api/conversations/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`getConversation: ${res.status}`)
  return (await res.json()) as ConversationDetail
}

export async function sendChat(
  message: string,
  conversationId?: string,
): Promise<ChatResponse> {
  const res = await apiFetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`sendChat ${res.status}: ${text}`)
  }
  return (await res.json()) as ChatResponse
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await apiFetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`deleteConversation: ${res.status}`)
  }
}

export async function resolveInputRequest(
  requestId: string,
  status: InputRequestStatus,
  values?: Record<string, unknown>,
): Promise<void> {
  const res = await apiFetch(`/api/input-requests/${encodeURIComponent(requestId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      status,
      values,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`resolveInputRequest ${res.status}: ${text}`)
  }
}
