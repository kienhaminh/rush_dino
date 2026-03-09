ALTER TABLE runtime_runs ADD COLUMN source TEXT;
ALTER TABLE runtime_runs ADD COLUMN channel_id TEXT;
ALTER TABLE runtime_runs ADD COLUMN sender_id TEXT;
ALTER TABLE runtime_runs ADD COLUMN gateway_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_runtime_runs_source_created
  ON runtime_runs(source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_runs_gateway_session_created
  ON runtime_runs(gateway_session_id, created_at DESC);

ALTER TABLE gateway_sessions ADD COLUMN last_run_id TEXT;
ALTER TABLE gateway_sessions ADD COLUMN last_delivery_at TEXT;
ALTER TABLE gateway_sessions ADD COLUMN last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_gateway_sessions_last_active
  ON gateway_sessions(last_active DESC);
