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
