CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  rich_content TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tool_logs (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  arguments TEXT NOT NULL,
  result TEXT NOT NULL,
  is_error INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  instructions TEXT NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS gateway_sessions (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  last_active TEXT NOT NULL,
  last_run_id TEXT,
  last_delivery_at TEXT,
  last_error TEXT,
  UNIQUE(channel_id, sender_id)
);

CREATE INDEX IF NOT EXISTS idx_gateway_sessions_last_active
  ON gateway_sessions(last_active DESC);

CREATE TABLE IF NOT EXISTS kg_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_type, source_ref)
);

CREATE TABLE IF NOT EXISTS kg_entities (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  entity_type TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(normalized_name)
);

CREATE TABLE IF NOT EXISTS kg_relations (
  id TEXT PRIMARY KEY,
  subject_entity_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_entity_id TEXT NOT NULL,
  confidence REAL NOT NULL,
  support_count INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (subject_entity_id) REFERENCES kg_entities(id) ON DELETE CASCADE,
  FOREIGN KEY (object_entity_id) REFERENCES kg_entities(id) ON DELETE CASCADE,
  UNIQUE(subject_entity_id, predicate, object_entity_id)
);

CREATE TABLE IF NOT EXISTS kg_relation_evidence (
  id TEXT PRIMARY KEY,
  relation_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  snippet TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (relation_id) REFERENCES kg_relations(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES kg_sources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_kg_entities_last_seen ON kg_entities(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_kg_relations_last_seen ON kg_relations(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_kg_evidence_relation ON kg_relation_evidence(relation_id);

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
  depends_on TEXT,
  max_retries INTEGER NOT NULL DEFAULT 0,
  timeout_secs INTEGER,
  condition TEXT,
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
  retry_count INTEGER NOT NULL DEFAULT 0,
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
  source TEXT,
  channel_id TEXT,
  sender_id TEXT,
  gateway_session_id TEXT,
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

CREATE INDEX IF NOT EXISTS idx_runtime_runs_source_created
  ON runtime_runs(source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_runs_gateway_session_created
  ON runtime_runs(gateway_session_id, created_at DESC);

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

CREATE TABLE IF NOT EXISTS dashboard_login_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_dashboard_login_codes_active
  ON dashboard_login_codes(expires_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_sessions (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL UNIQUE,
  created_from_code_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (created_from_code_id) REFERENCES dashboard_login_codes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_active
  ON dashboard_sessions(expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_run_events_run_created
  ON runtime_run_events(run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS channel_pairing_requests (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_display TEXT,
  reply_target TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_pairing_requests_pending_sender
  ON channel_pairing_requests(channel_id, sender_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_pairing_requests_pending_code
  ON channel_pairing_requests(channel_id, code)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS channel_pairing_approvals (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_display TEXT,
  approved_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(channel_id, sender_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_pairing_approvals_last_seen
  ON channel_pairing_approvals(channel_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS cron_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  schedule_kind TEXT NOT NULL,
  schedule_payload TEXT NOT NULL,
  timezone TEXT,
  target_kind TEXT NOT NULL,
  target_payload TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  reentrant INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'active',
  last_run_at TEXT,
  next_run_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run
  ON cron_jobs(enabled, next_run_at);

CREATE TABLE IF NOT EXISTS cron_job_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL,
  trigger_kind TEXT NOT NULL,
  summary TEXT,
  error TEXT,
  session_id TEXT,
  workflow_run_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_started
  ON cron_job_runs(job_id, started_at DESC);
