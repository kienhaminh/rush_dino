-- Workflow step execution enhancements: parallel DAG, retry, timeout, conditions

ALTER TABLE workflow_steps ADD COLUMN depends_on   TEXT;            -- JSON array of step IDs, NULL = linear (position-based)
ALTER TABLE workflow_steps ADD COLUMN max_retries  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_steps ADD COLUMN timeout_secs INTEGER;         -- NULL = no timeout
ALTER TABLE workflow_steps ADD COLUMN condition     TEXT;           -- NULL = always run, e.g. "step_name.succeeded"

ALTER TABLE workflow_run_steps ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
