/** Priority levels for kanban tasks. */
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

/** Kanban lifecycle statuses matching the backend enum. */
export type TaskStatus =
  | 'backlog'
  | 'claimed'
  | 'in_progress'
  | 'blocked'
  | 'in_review'
  | 'done'
  | 'failed';

/** A single kanban task as returned by the API. */
export type KanbanTask = {
  id: string;
  sourceRequestId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string;
  tags: string[];
  priority: TaskPriority;
  status: TaskStatus;
  assignedAgent: string | null;
  conversationId: string | null;
  result: string | null;
  reviewFeedback: string | null;
  blockReason: string | null;
  complexityLevel: number;
  depth: number;
  createdAt: string;
  updatedAt: string;
  claimedAt: string | null;
  completedAt: string | null;
  revisionCount: number;
  notifyConversationId: string | null;
};

/** Board statistics. */
export type KanbanBoardStats = {
  total: number;
  backlog: number;
  claimed: number;
  inProgress: number;
  blocked: number;
  inReview: number;
  done: number;
  failed: number;
};

/** Full board response with columns and stats. */
export type KanbanBoardResponse = {
  generatedAt: string;
  stats: KanbanBoardStats;
  columns: KanbanBoardColumns;
};

/** Tasks grouped by status column. */
export type KanbanBoardColumns = {
  backlog: KanbanTask[];
  claimed: KanbanTask[];
  inProgress: KanbanTask[];
  blocked: KanbanTask[];
  inReview: KanbanTask[];
  done: KanbanTask[];
  failed: KanbanTask[];
};

/** Column metadata for rendering. */
export type KanbanColumnConfig = {
  key: keyof KanbanBoardColumns;
  label: string;
  color: string;
  emptyLabel: string;
};

/** All columns in display order. */
export const KANBAN_COLUMNS: KanbanColumnConfig[] = [
  { key: 'backlog', label: 'Backlog', color: 'text-muted-foreground', emptyLabel: 'No tasks waiting' },
  { key: 'claimed', label: 'Claimed', color: 'text-blue-500', emptyLabel: 'No claimed tasks' },
  { key: 'inProgress', label: 'In Progress', color: 'text-yellow-500', emptyLabel: 'No active tasks' },
  { key: 'blocked', label: 'Blocked', color: 'text-red-500', emptyLabel: 'No blocked tasks' },
  { key: 'inReview', label: 'In Review', color: 'text-purple-500', emptyLabel: 'No tasks in review' },
  { key: 'done', label: 'Done', color: 'text-green-500', emptyLabel: 'No completed tasks' },
  { key: 'failed', label: 'Failed', color: 'text-destructive', emptyLabel: 'No failed tasks' },
];
