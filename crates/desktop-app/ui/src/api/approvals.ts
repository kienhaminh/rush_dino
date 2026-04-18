import { apiFetch } from './bootstrap'

export type ApprovalQueueItem = {
  requestId: string
  sessionId: string
  conversationId: string
  runId?: string | null
  tool: string
  args: unknown
}

export async function listApprovals(): Promise<ApprovalQueueItem[]> {
  const res = await apiFetch('/api/approvals')
  if (!res.ok) throw new Error(`approvals: ${res.status}`)
  const body = await res.json()
  if (Array.isArray(body)) return body as ApprovalQueueItem[]
  if (body && typeof body === 'object' && 'items' in body) {
    return (body.items as ApprovalQueueItem[]) ?? []
  }
  return []
}

export async function resolveApproval(
  requestId: string,
  sessionId: string,
  approved: boolean,
): Promise<void> {
  const res = await apiFetch(`/api/approval/${encodeURIComponent(requestId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approved, session_id: sessionId }),
  })
  if (!res.ok) throw new Error(`approval.resolve: ${res.status}`)
}
