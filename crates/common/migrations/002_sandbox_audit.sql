CREATE TABLE IF NOT EXISTS sandbox_audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL,
    agent_id    TEXT,
    ts          DATETIME DEFAULT CURRENT_TIMESTAMP,
    category    TEXT NOT NULL,
    decision    TEXT NOT NULL,
    binary      TEXT,
    destination TEXT,
    method      TEXT,
    path        TEXT,
    reason      TEXT
);

CREATE INDEX IF NOT EXISTS idx_sandbox_audit_session ON sandbox_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_audit_ts ON sandbox_audit_log(ts);
