CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  instructions TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  UNIQUE(workflow_id, position)
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '',
  error TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '',
  output TEXT,
  error TEXT,
  conversation_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE,
  UNIQUE(run_id, position)
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_started
  ON workflow_runs(workflow_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_status
  ON workflow_runs(workflow_id, status);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_position
  ON workflow_steps(workflow_id, position);
