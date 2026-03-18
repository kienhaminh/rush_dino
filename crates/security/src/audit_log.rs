//! Sandbox audit log — persists policy decisions (allow/deny/route/pending) to SQLite.
//!
//! Uses a non-blocking mpsc channel so callers never wait on disk I/O.
//! A background tokio task drains the channel and writes rows to the
//! `sandbox_audit_log` table (created by migration 002_sandbox_audit.sql).

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A single sandbox policy decision to be recorded.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    /// Runtime session that triggered the decision.
    pub session_id: String,
    /// Optional agent identifier within the session.
    pub agent_id: Option<String>,
    /// Which resource class was evaluated.
    pub category: AuditCategory,
    /// The outcome of the policy evaluation.
    pub decision: AuditDecision,
    /// For `Process` entries: the executable path / name.
    pub binary: Option<String>,
    /// For `Network` entries: `"host:port"` string.
    pub destination: Option<String>,
    /// For `Network` HTTP entries: HTTP method (GET, POST, …).
    pub method: Option<String>,
    /// For `Filesystem` entries: the file-system path accessed.
    pub path: Option<String>,
    /// Human-readable explanation for the decision (e.g. rule that matched).
    pub reason: Option<String>,
}

/// Broad category of the sandboxed resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuditCategory {
    Filesystem,
    Network,
    Process,
    Inference,
}

impl std::fmt::Display for AuditCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            AuditCategory::Filesystem => "filesystem",
            AuditCategory::Network => "network",
            AuditCategory::Process => "process",
            AuditCategory::Inference => "inference",
        };
        f.write_str(s)
    }
}

/// Outcome of a sandbox policy evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuditDecision {
    Allow,
    Deny,
    Route,
    Pending,
}

impl std::fmt::Display for AuditDecision {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            AuditDecision::Allow => "allow",
            AuditDecision::Deny => "deny",
            AuditDecision::Route => "route",
            AuditDecision::Pending => "pending",
        };
        f.write_str(s)
    }
}

// ---------------------------------------------------------------------------
// AuditLog
// ---------------------------------------------------------------------------

/// Non-blocking audit log that writes entries via a background channel.
///
/// Clone the `Arc<AuditLog>` freely — all clones share the same sender.
pub struct AuditLog {
    tx: mpsc::UnboundedSender<AuditEntry>,
}

impl AuditLog {
    /// Creates an audit log backed by SQLite.
    ///
    /// Spawns a background tokio task that writes each entry to the
    /// `sandbox_audit_log` table.  The task exits automatically when the last
    /// `AuditLog` (and its cloned `Arc`s) are dropped.
    #[cfg(feature = "audit-log")]
    pub fn new(pool: Arc<sqlx::SqlitePool>) -> Arc<Self> {
        let (tx, mut rx) = mpsc::unbounded_channel::<AuditEntry>();

        tokio::spawn(async move {
            while let Some(entry) = rx.recv().await {
                let category = entry.category.to_string();
                let decision = entry.decision.to_string();

                let result = sqlx::query(
                    "INSERT INTO sandbox_audit_log \
                     (session_id, agent_id, category, decision, binary, destination, method, path, reason) \
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(&entry.session_id)
                .bind(&entry.agent_id)
                .bind(&category)
                .bind(&decision)
                .bind(&entry.binary)
                .bind(&entry.destination)
                .bind(&entry.method)
                .bind(&entry.path)
                .bind(&entry.reason)
                .execute(&*pool)
                .await;

                if let Err(e) = result {
                    tracing::warn!("audit_log: failed to write entry: {e}");
                }
            }
        });

        Arc::new(Self { tx })
    }

    /// Records an audit entry (non-blocking — never blocks the caller).
    ///
    /// Errors are silently dropped; audit failures must not affect agent
    /// execution.
    pub fn record(&self, entry: AuditEntry) {
        // Ignore send errors — the background task may have already exited
        // (e.g. during shutdown).
        let _ = self.tx.send(entry);
    }

    /// Queries the most recent `limit` audit entries for a given session.
    ///
    /// Returns rows in ascending timestamp order (oldest first).
    #[cfg(feature = "audit-log")]
    pub async fn query(
        pool: &sqlx::SqlitePool,
        session_id: &str,
        limit: u32,
    ) -> Result<Vec<AuditEntry>, sqlx::Error> {
        // We use the non-macro query API to avoid DATABASE_URL compile-time
        // requirements.
        let rows = sqlx::query(
            "SELECT session_id, agent_id, category, decision, binary, destination, method, path, reason \
             FROM sandbox_audit_log \
             WHERE session_id = ? \
             ORDER BY ts ASC \
             LIMIT ?",
        )
        .bind(session_id)
        .bind(limit as i64)
        .fetch_all(pool)
        .await?;

        use sqlx::Row as _;

        let entries = rows
            .into_iter()
            .map(|row| {
                let category_str: String = row.try_get("category").unwrap_or_default();
                let decision_str: String = row.try_get("decision").unwrap_or_default();

                AuditEntry {
                    session_id: row.try_get("session_id").unwrap_or_default(),
                    agent_id: row.try_get("agent_id").ok().flatten(),
                    category: parse_category(&category_str),
                    decision: parse_decision(&decision_str),
                    binary: row.try_get("binary").ok().flatten(),
                    destination: row.try_get("destination").ok().flatten(),
                    method: row.try_get("method").ok().flatten(),
                    path: row.try_get("path").ok().flatten(),
                    reason: row.try_get("reason").ok().flatten(),
                }
            })
            .collect();

        Ok(entries)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_category(s: &str) -> AuditCategory {
    match s {
        "filesystem" => AuditCategory::Filesystem,
        "network" => AuditCategory::Network,
        "process" => AuditCategory::Process,
        "inference" => AuditCategory::Inference,
        // Fall back to filesystem for unknown values
        _ => AuditCategory::Filesystem,
    }
}

fn parse_decision(s: &str) -> AuditDecision {
    match s {
        "allow" => AuditDecision::Allow,
        "deny" => AuditDecision::Deny,
        "route" => AuditDecision::Route,
        "pending" => AuditDecision::Pending,
        // Fall back to deny for unknown values (safe default)
        _ => AuditDecision::Deny,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audit_entry_serializes_to_expected_json() {
        let entry = AuditEntry {
            session_id: "sess-123".to_string(),
            agent_id: Some("agent-abc".to_string()),
            category: AuditCategory::Network,
            decision: AuditDecision::Deny,
            binary: None,
            destination: Some("evil.example.com:443".to_string()),
            method: Some("GET".to_string()),
            path: None,
            reason: Some("blocked by policy".to_string()),
        };

        let json = serde_json::to_value(&entry).expect("serialization failed");

        assert_eq!(json["session_id"], "sess-123");
        assert_eq!(json["agent_id"], "agent-abc");
        assert_eq!(json["category"], "network");
        assert_eq!(json["decision"], "deny");
        assert_eq!(json["destination"], "evil.example.com:443");
        assert_eq!(json["method"], "GET");
        assert_eq!(json["reason"], "blocked by policy");
        assert!(json["binary"].is_null());
        assert!(json["path"].is_null());
    }

    #[test]
    fn audit_category_display_and_serde_round_trip() {
        let cases = [
            (AuditCategory::Filesystem, "filesystem"),
            (AuditCategory::Network, "network"),
            (AuditCategory::Process, "process"),
            (AuditCategory::Inference, "inference"),
        ];

        for (cat, expected) in &cases {
            // Display
            assert_eq!(cat.to_string(), *expected);

            // Serde round-trip via JSON string
            let json_str = serde_json::to_string(cat).expect("serialize");
            // serde_json serialises the string with quotes
            let quoted = format!("\"{expected}\"");
            assert_eq!(json_str, quoted);

            let deserialized: AuditCategory =
                serde_json::from_str(&json_str).expect("deserialize");
            assert_eq!(deserialized.to_string(), *expected);
        }
    }

    #[test]
    fn audit_decision_display_and_serde_round_trip() {
        let cases = [
            (AuditDecision::Allow, "allow"),
            (AuditDecision::Deny, "deny"),
            (AuditDecision::Route, "route"),
            (AuditDecision::Pending, "pending"),
        ];

        for (dec, expected) in &cases {
            assert_eq!(dec.to_string(), *expected);

            let json_str = serde_json::to_string(dec).expect("serialize");
            let quoted = format!("\"{expected}\"");
            assert_eq!(json_str, quoted);

            let deserialized: AuditDecision =
                serde_json::from_str(&json_str).expect("deserialize");
            assert_eq!(deserialized.to_string(), *expected);
        }
    }

    #[test]
    fn parse_helpers_fall_back_safely() {
        // Unknown category -> filesystem
        assert_eq!(parse_category("unknown_value").to_string(), "filesystem");
        // Unknown decision -> deny
        assert_eq!(parse_decision("unknown_value").to_string(), "deny");
    }
}
