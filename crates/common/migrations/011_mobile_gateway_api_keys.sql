CREATE TABLE IF NOT EXISTS mobile_gateway_api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  sender_id TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mobile_gateway_api_keys_revoked
  ON mobile_gateway_api_keys(revoked_at);
