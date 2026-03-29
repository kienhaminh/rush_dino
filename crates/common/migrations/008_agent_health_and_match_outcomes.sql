-- Track task outcomes per agent for matching feedback loop
CREATE TABLE IF NOT EXISTS agent_match_outcomes (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  task_id TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  succeeded INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_match_outcomes_agent
  ON agent_match_outcomes(agent_name, created_at DESC);

-- Track agent health for circuit breaker
CREATE TABLE IF NOT EXISTS agent_health_events (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  task_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_health_events_agent
  ON agent_health_events(agent_name, created_at DESC);

-- Add revision_count to kanban_tasks for feedback loop (Step 6)
ALTER TABLE kanban_tasks ADD COLUMN revision_count INTEGER NOT NULL DEFAULT 0;
