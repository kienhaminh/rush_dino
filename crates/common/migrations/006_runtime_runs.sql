CREATE TABLE IF NOT EXISTS runtime_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  session_id TEXT,
  conversation_id TEXT,
  workflow_id TEXT,
  title TEXT NOT NULL,
  input_text TEXT,
  output_text TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  fallback_profile_id TEXT,
  queue_position INTEGER,
  active_tool TEXT,
  policy_decision TEXT NOT NULL DEFAULT 'allow',
  approval_state TEXT NOT NULL DEFAULT 'not_required',
  sandbox_state TEXT NOT NULL DEFAULT 'unknown',
  effective_scope TEXT NOT NULL DEFAULT 'workspace',
  reason TEXT,
  error TEXT,
  abort_requested INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_runs_created
  ON runtime_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_runs_session_state
  ON runtime_runs(session_id, state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_runs_conversation_created
  ON runtime_runs(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS runtime_run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  state TEXT,
  tool_name TEXT,
  message TEXT,
  policy_decision TEXT NOT NULL DEFAULT 'allow',
  approval_state TEXT NOT NULL DEFAULT 'not_required',
  sandbox_state TEXT NOT NULL DEFAULT 'unknown',
  effective_scope TEXT NOT NULL DEFAULT 'workspace',
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runtime_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runtime_run_events_run_created
  ON runtime_run_events(run_id, created_at DESC);
