import { apiFetch } from './bootstrap'

/* Mirrors crates/agent/src/kanban_store.rs types (serialized as camelCase
 * via serde rename on the KanbanBoardResponse; the task struct itself is
 * snake_case because it isn't rename-cased on the Rust side). */

export type TaskStatus =
  | 'backlog'
  | 'claimed'
  | 'in_progress'
  | 'blocked'
  | 'in_review'
  | 'done'
  | 'failed'

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'

export type KanbanTask = {
  id: string
  source_request_id?: string | null
  parent_task_id?: string | null
  title: string
  description: string
  tags: string[]
  priority: TaskPriority
  status: TaskStatus
  assigned_agent?: string | null
  conversation_id?: string | null
  result?: string | null
  review_feedback?: string | null
  block_reason?: string | null
  complexity_level?: number
  depth?: number
  created_at: string
  updated_at: string
  claimed_at?: string | null
  completed_at?: string | null
  revision_count?: number
}

export type KanbanBoardStats = {
  total: number
  backlog: number
  claimed: number
  in_progress: number
  blocked: number
  in_review: number
  done: number
  failed: number
}

export type KanbanBoardColumns = {
  backlog: KanbanTask[]
  claimed: KanbanTask[]
  inProgress: KanbanTask[]
  blocked: KanbanTask[]
  inReview: KanbanTask[]
  done: KanbanTask[]
  failed: KanbanTask[]
}

export type KanbanBoardResponse = {
  generatedAt: string
  stats: KanbanBoardStats
  columns: KanbanBoardColumns
}

export async function getBoard(): Promise<KanbanBoardResponse> {
  const res = await apiFetch('/api/kanban/board')
  if (!res.ok) throw new Error(`kanban.board: ${res.status}`)
  return (await res.json()) as KanbanBoardResponse
}

export async function listTasks(filter?: {
  status?: TaskStatus
  agent?: string
  source?: string
}): Promise<KanbanTask[]> {
  const qs = new URLSearchParams()
  if (filter?.status) qs.set('status', filter.status)
  if (filter?.agent) qs.set('agent', filter.agent)
  if (filter?.source) qs.set('source', filter.source)
  const q = qs.toString()
  const res = await apiFetch(`/api/kanban/tasks${q ? `?${q}` : ''}`)
  if (!res.ok) throw new Error(`kanban.tasks: ${res.status}`)
  return (await res.json()) as KanbanTask[]
}

export async function deleteTask(id: string): Promise<void> {
  const res = await apiFetch(`/api/kanban/tasks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`kanban.delete: ${res.status}`)
  }
}
