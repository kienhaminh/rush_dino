-- Kanban task board for inter-agent collaboration.
-- Each row represents a task that agents can create, claim, and work on.
-- Tasks form a tree via parent_task_id for subtask decomposition.

CREATE TABLE IF NOT EXISTS kanban_tasks (
  id TEXT PRIMARY KEY,
  -- Link back to the user request that spawned this task tree.
  source_request_id TEXT,
  -- Parent task for subtask chains (NULL for root tasks).
  parent_task_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  -- Comma-separated tags for matching (e.g. "code,architecture,debugging").
  tags TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium',
  -- Kanban lifecycle status.
  status TEXT NOT NULL DEFAULT 'backlog',
  -- Agent that claimed/owns this task (NULL while in backlog).
  assigned_agent TEXT,
  -- Conversation created for the agent's work on this task.
  conversation_id TEXT,
  -- Result output from the agent after completion.
  result TEXT,
  -- Feedback from the orchestrator when task needs revision.
  review_feedback TEXT,
  -- Reason the task is blocked (set when status = 'blocked').
  block_reason TEXT,
  -- Complexity level detected by orchestrator (1=simple, 2=moderate, 3=complex).
  complexity_level INTEGER NOT NULL DEFAULT 2,
  -- Depth in the subtask chain (0 = root, max 3).
  depth INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  claimed_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (parent_task_id) REFERENCES kanban_tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_kanban_tasks_status
  ON kanban_tasks(status);

CREATE INDEX IF NOT EXISTS idx_kanban_tasks_assigned_agent
  ON kanban_tasks(assigned_agent);

CREATE INDEX IF NOT EXISTS idx_kanban_tasks_source_request
  ON kanban_tasks(source_request_id);

CREATE INDEX IF NOT EXISTS idx_kanban_tasks_parent
  ON kanban_tasks(parent_task_id);

CREATE INDEX IF NOT EXISTS idx_kanban_tasks_created
  ON kanban_tasks(created_at DESC);
