ALTER TABLE agent_messages
  ADD COLUMN state TEXT NOT NULL DEFAULT 'processed';

ALTER TABLE agent_messages
  ADD COLUMN reply_to_message_id TEXT NULL;

ALTER TABLE agent_messages
  ADD COLUMN failure_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_messages_pending
  ON agent_messages(to_agent, state, created_at DESC);
