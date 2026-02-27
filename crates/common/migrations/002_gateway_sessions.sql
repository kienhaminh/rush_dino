CREATE TABLE IF NOT EXISTS gateway_sessions (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  last_active TEXT NOT NULL,
  UNIQUE(channel_id, sender_id)
);
