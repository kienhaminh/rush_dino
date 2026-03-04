CREATE TABLE IF NOT EXISTS runtime_logs (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  target TEXT NOT NULL,
  message TEXT NOT NULL,
  fields TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_logs_created_at
  ON runtime_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS usage_metrics (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_metrics_conversation_created
  ON usage_metrics(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_metrics_created
  ON usage_metrics(created_at DESC);
