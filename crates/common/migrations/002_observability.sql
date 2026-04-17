-- 002_observability.sql
-- Add trace_id to runtime_runs for end-to-end request tracing.
ALTER TABLE runtime_runs ADD COLUMN trace_id TEXT;

-- Add per-call timing to tool_logs.
ALTER TABLE tool_logs ADD COLUMN duration_ms INTEGER;
ALTER TABLE tool_logs ADD COLUMN success INTEGER NOT NULL DEFAULT 1;

-- Add provider latency to usage_metrics.
ALTER TABLE usage_metrics ADD COLUMN ttft_ms INTEGER;
ALTER TABLE usage_metrics ADD COLUMN total_ms INTEGER;
