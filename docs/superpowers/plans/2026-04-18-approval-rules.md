# Approval Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a policy-based approval rules engine so repetitive approvals can be automated with configurable rules, with full audit logging of every decision.

**Architecture:** New `approval_rules` table stores prioritized rules with pattern matching and cost thresholds. Rule evaluator runs before the human approval gate inside `LocalSystemBroker::ensure_approval` and short-circuits with auto_approve/auto_reject when a rule matches. All decisions (human + automated) go to `approval_audit_log`. CRUD API + React frontend for managing rules.

**Tech Stack:** Rust (axum, sqlx), glob pattern matching, React, TypeScript, Tailwind, React Query

---

## Codebase Context

- **Approval gate:** `crates/server/src/approval_gate.rs` — in-memory `ApprovalGate` struct, holds pending requests keyed by `request_id`. `request_approval()` blocks until resolved or timed out.
- **Approval flow entry point:** `crates/server/src/system_broker.rs` — `LocalSystemBroker::ensure_approval()` is where dangerous shell commands get intercepted. Rule evaluation hooks in here.
- **Human approval resolution:** `crates/server/src/routes/approval.rs` — `resolve_approval()` handler processes the human APPROVED/REJECTED decision. Audit log write for human decisions goes here.
- **DB pool access pattern:** Pool is stored in `RuntimeState` (accessed via `state.runtime.pool()`). Direct `sqlx::query()` calls with `pool.as_ref()` as executor — see `crates/server/src/runtime_log_store.rs` for the canonical pattern.
- **Migration files:** `crates/common/migrations/001_init.sql` — single consolidated file (previously 001-012). Add new migration as `002_approval_rules.sql`.
- **Route registration:** `crates/server/src/lib.rs` routes section (lines ~418-640). Add new routes alongside existing `/api/approvals`.
- **Routes mod:** `crates/server/src/routes/mod.rs` — add `pub mod approval_rules;`.
- **Frontend routing:** `frontend/src/App.tsx` — lazy-load page and add `<Route path="approval-rules" element={<ApprovalRulesPage />} />`.
- **Frontend nav:** `frontend/src/lib/navigation.ts` — add sidebar item under `operations` group.
- **API client pattern:** See `frontend/src/lib/api/cron.ts` and `frontend/src/lib/api/approvals.ts` for fetch patterns. All use `parseJsonOrThrow`.
- **React Query pattern:** See `frontend/src/lib/queries/misc.ts` for `useQuery`/`useMutation` hook patterns and query key factories.

---

## Task 1: DB Migration for approval_rules and approval_audit_log

**Files:**
- Create: `crates/common/migrations/002_approval_rules.sql`

**Steps:**

- [ ] 1.1 Create the migration file:

```sql
-- Migration 002: Approval Rules Engine
-- Adds tables for configurable approval policy rules and a full audit log
-- of all approval decisions (both automated and human).

-- approval_rules: stores prioritized policy rules with pattern matching.
-- Rules are evaluated in descending priority order; first match wins.
CREATE TABLE IF NOT EXISTS approval_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    -- glob pattern for tool name (e.g. "bash*", "read_*"); NULL = match all tools
    tool_name_pattern TEXT,
    -- trigger only when estimated token cost exceeds this threshold; NULL = ignore cost
    cost_threshold_tokens INTEGER,
    -- scope filters; NULL = match any value
    agent_id TEXT,
    workflow_id TEXT,
    -- what to do when this rule matches
    action TEXT NOT NULL CHECK(action IN ('auto_approve', 'auto_reject', 'require_human')),
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Index for fast priority-ordered rule evaluation queries
CREATE INDEX IF NOT EXISTS idx_approval_rules_priority
    ON approval_rules(priority DESC, enabled);

-- approval_audit_log: immutable record of every approval decision.
-- Covers both automated decisions (rule_id set) and human decisions (decided_by = 'human').
CREATE TABLE IF NOT EXISTS approval_audit_log (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    -- decision values: 'approved'/'rejected' for human, 'auto_approved'/'auto_rejected' for rules
    decision TEXT NOT NULL CHECK(decision IN ('approved', 'rejected', 'auto_approved', 'auto_rejected')),
    -- set when decision was made by a rule; NULL for human decisions
    rule_id TEXT REFERENCES approval_rules(id),
    -- 'human' for human decisions, 'system' for automated rule decisions
    decided_by TEXT,
    decided_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    -- JSON summary of tool arguments for audit trail
    context TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_audit_run
    ON approval_audit_log(run_id);
CREATE INDEX IF NOT EXISTS idx_approval_audit_time
    ON approval_audit_log(decided_at DESC);
```

- [ ] 1.2 Run `cargo test -p rushdino-common` to verify migrations compile and run cleanly
- [ ] 1.3 Commit: `feat(db): add approval_rules and approval_audit_log migration`

---

## Task 2: ApprovalRule Struct and Rule Evaluator

**Files:**
- Create: `crates/server/src/approval_rules_store.rs`
- Modify: `crates/server/src/lib.rs` — add `pub mod approval_rules_store;`

**Note:** The evaluator lives in the `server` crate (not `agent`) because it needs direct DB access via `SqlitePool` which is held by `RuntimeState`. Keeping it in `server` avoids introducing a new DB dependency into the `agent` crate.

**Steps:**

- [ ] 2.1 Write the module with full test coverage first (TDD):

```rust
//! Approval rules store and in-process rule evaluator.
//!
//! Rules are loaded from SQLite, evaluated in descending priority order, and
//! the first matching enabled rule's action is applied. If no rule matches,
//! the caller falls back to human approval.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use rushdino_common::{AppError, Result};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// A single policy rule loaded from the `approval_rules` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRule {
    pub id: String,
    pub name: String,
    pub priority: i64,
    /// Glob pattern for the tool name. `None` matches all tools.
    pub tool_name_pattern: Option<String>,
    /// Trigger only when estimated token cost exceeds this threshold. `None` = ignore.
    pub cost_threshold_tokens: Option<i64>,
    /// Scope filter: only apply to this agent. `None` = any agent.
    pub agent_id: Option<String>,
    /// Scope filter: only apply to this workflow. `None` = any workflow.
    pub workflow_id: Option<String>,
    /// The action to apply when this rule matches.
    pub action: RuleAction,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// The action a matching rule should trigger.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RuleAction {
    AutoApprove,
    AutoReject,
    RequireHuman,
}

impl RuleAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::AutoApprove => "auto_approve",
            Self::AutoReject => "auto_reject",
            Self::RequireHuman => "require_human",
        }
    }

    pub fn parse(s: &str) -> Result<Self> {
        match s {
            "auto_approve" => Ok(Self::AutoApprove),
            "auto_reject" => Ok(Self::AutoReject),
            "require_human" => Ok(Self::RequireHuman),
            other => Err(AppError::Validation(format!("invalid rule action: {other}"))),
        }
    }
}

/// Context passed to the rule evaluator for a given tool call.
#[derive(Debug, Clone)]
pub struct ApprovalContext {
    pub tool_name: String,
    pub agent_id: Option<String>,
    pub workflow_id: Option<String>,
    /// Estimated token cost for the current run. Used for cost-threshold rules.
    pub estimated_tokens: i64,
}

/// Input for creating a new rule.
#[derive(Debug, Deserialize)]
pub struct CreateRuleRequest {
    pub name: String,
    pub priority: i64,
    pub tool_name_pattern: Option<String>,
    pub cost_threshold_tokens: Option<i64>,
    pub agent_id: Option<String>,
    pub workflow_id: Option<String>,
    pub action: String,
    pub enabled: Option<bool>,
}

/// Input for updating an existing rule.
#[derive(Debug, Deserialize)]
pub struct UpdateRuleRequest {
    pub name: Option<String>,
    pub priority: Option<i64>,
    pub tool_name_pattern: Option<serde_json::Value>, // null to clear, string to set
    pub cost_threshold_tokens: Option<serde_json::Value>, // null to clear, number to set
    pub agent_id: Option<serde_json::Value>,
    pub workflow_id: Option<serde_json::Value>,
    pub action: Option<String>,
    pub enabled: Option<bool>,
}

// ---------------------------------------------------------------------------
// Glob pattern matching
// ---------------------------------------------------------------------------

/// Match a value against a simple glob pattern supporting `*` as a wildcard.
///
/// Rules:
/// - `*` matches any sequence of characters (including empty).
/// - Matching is case-sensitive.
/// - A `None` pattern matches everything.
///
/// Examples:
/// - `bash*` matches `bash_execute`, `bash_run` but not `read_file`
/// - `*_file` matches `read_file`, `write_file` but not `bash_execute`
/// - `*` matches everything
pub fn matches_glob(pattern: &str, value: &str) -> bool {
    // Split on `*` and check that each segment appears in order in `value`
    let mut segments = pattern.splitn(usize::MAX, '*');
    let mut remaining = value;

    // First segment must be a prefix
    let first = segments.next().unwrap_or("");
    if !remaining.starts_with(first) {
        return false;
    }
    remaining = &remaining[first.len()..];

    for segment in segments {
        if segment.is_empty() {
            // Trailing `*` — matches rest of string
            continue;
        }
        match remaining.find(segment) {
            Some(pos) => {
                remaining = &remaining[pos + segment.len()..];
            }
            None => return false,
        }
    }

    // If pattern ended without a trailing `*`, remaining must be empty
    if !pattern.ends_with('*') && !remaining.is_empty() {
        return false;
    }

    true
}

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

/// Evaluate a slice of rules (pre-sorted by priority DESC) against an approval context.
///
/// Returns a reference to the first matching enabled rule, or `None` if no rule
/// matches (caller should fall back to human approval).
pub fn evaluate_rules<'a>(rules: &'a [ApprovalRule], ctx: &ApprovalContext) -> Option<&'a ApprovalRule> {
    for rule in rules {
        if !rule.enabled {
            continue;
        }

        // Tool name pattern check
        if let Some(pattern) = &rule.tool_name_pattern {
            if !matches_glob(pattern, &ctx.tool_name) {
                continue;
            }
        }

        // Cost threshold check — only block if token cost EXCEEDS threshold
        if let Some(threshold) = rule.cost_threshold_tokens {
            if ctx.estimated_tokens <= threshold {
                continue;
            }
        }

        // Agent scope check
        if let Some(rule_agent) = &rule.agent_id {
            match &ctx.agent_id {
                Some(ctx_agent) if ctx_agent == rule_agent => {}
                _ => continue,
            }
        }

        // Workflow scope check
        if let Some(rule_wf) = &rule.workflow_id {
            match &ctx.workflow_id {
                Some(ctx_wf) if ctx_wf == rule_wf => {}
                _ => continue,
            }
        }

        return Some(rule);
    }
    None
}

// ---------------------------------------------------------------------------
// Database store
// ---------------------------------------------------------------------------

/// Persistent store for approval rules and audit log entries.
pub struct ApprovalRulesStore {
    pool: Arc<SqlitePool>,
}

impl ApprovalRulesStore {
    pub fn new(pool: Arc<SqlitePool>) -> Arc<Self> {
        Arc::new(Self { pool })
    }

    // ---- Rules CRUD -------------------------------------------------------

    /// Load all enabled rules ordered by priority DESC for evaluation.
    pub async fn list_active_rules(&self) -> Result<Vec<ApprovalRule>> {
        let rows = sqlx::query(
            "SELECT id, name, priority, tool_name_pattern, cost_threshold_tokens, \
             agent_id, workflow_id, action, enabled, created_at, updated_at \
             FROM approval_rules \
             WHERE enabled = 1 \
             ORDER BY priority DESC",
        )
        .fetch_all(self.pool.as_ref())
        .await?;

        rows.into_iter().map(|row| rule_from_row(&row)).collect::<Result<Vec<_>>>()
    }

    /// Load all rules (for management UI), ordered by priority DESC.
    pub async fn list_all_rules(&self) -> Result<Vec<ApprovalRule>> {
        let rows = sqlx::query(
            "SELECT id, name, priority, tool_name_pattern, cost_threshold_tokens, \
             agent_id, workflow_id, action, enabled, created_at, updated_at \
             FROM approval_rules \
             ORDER BY priority DESC",
        )
        .fetch_all(self.pool.as_ref())
        .await?;

        rows.into_iter().map(|row| rule_from_row(&row)).collect::<Result<Vec<_>>>()
    }

    /// Create a new rule.
    pub async fn create_rule(&self, req: CreateRuleRequest) -> Result<ApprovalRule> {
        // Validate action string before inserting
        let action = RuleAction::parse(&req.action)?;
        let id = Uuid::new_v4().to_string();
        let enabled = req.enabled.unwrap_or(true);

        sqlx::query(
            "INSERT INTO approval_rules \
             (id, name, priority, tool_name_pattern, cost_threshold_tokens, \
              agent_id, workflow_id, action, enabled) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        )
        .bind(&id)
        .bind(&req.name)
        .bind(req.priority)
        .bind(&req.tool_name_pattern)
        .bind(req.cost_threshold_tokens)
        .bind(&req.agent_id)
        .bind(&req.workflow_id)
        .bind(action.as_str())
        .bind(enabled as i64)
        .execute(self.pool.as_ref())
        .await?;

        self.get_rule(&id).await
    }

    /// Get a single rule by ID.
    pub async fn get_rule(&self, id: &str) -> Result<ApprovalRule> {
        let row = sqlx::query(
            "SELECT id, name, priority, tool_name_pattern, cost_threshold_tokens, \
             agent_id, workflow_id, action, enabled, created_at, updated_at \
             FROM approval_rules WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(self.pool.as_ref())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("approval rule '{id}' not found")))?;

        rule_from_row(&row)
    }

    /// Update an existing rule by ID.
    pub async fn update_rule(&self, id: &str, req: UpdateRuleRequest) -> Result<ApprovalRule> {
        // Validate action if provided
        if let Some(action_str) = &req.action {
            RuleAction::parse(action_str)?;
        }

        // Build SET clauses dynamically — only update provided fields
        let mut sets: Vec<String> = vec!["updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')".to_owned()];
        if req.name.is_some() { sets.push("name = ?".to_owned()); }
        if req.priority.is_some() { sets.push("priority = ?".to_owned()); }
        if req.tool_name_pattern.is_some() { sets.push("tool_name_pattern = ?".to_owned()); }
        if req.cost_threshold_tokens.is_some() { sets.push("cost_threshold_tokens = ?".to_owned()); }
        if req.agent_id.is_some() { sets.push("agent_id = ?".to_owned()); }
        if req.workflow_id.is_some() { sets.push("workflow_id = ?".to_owned()); }
        if req.action.is_some() { sets.push("action = ?".to_owned()); }
        if req.enabled.is_some() { sets.push("enabled = ?".to_owned()); }

        if sets.len() == 1 {
            // Only timestamp — still valid, return current
            return self.get_rule(id).await;
        }

        let sql = format!("UPDATE approval_rules SET {} WHERE id = ?", sets.join(", "));
        let mut q = sqlx::query(&sql);

        // Bind values in the same order as the SET clauses
        if let Some(v) = &req.name { q = q.bind(v); }
        if let Some(v) = req.priority { q = q.bind(v); }
        if let Some(v) = &req.tool_name_pattern {
            q = q.bind(if v.is_null() { None::<String> } else { v.as_str().map(ToOwned::to_owned) });
        }
        if let Some(v) = &req.cost_threshold_tokens {
            q = q.bind(if v.is_null() { None::<i64> } else { v.as_i64() });
        }
        if let Some(v) = &req.agent_id {
            q = q.bind(if v.is_null() { None::<String> } else { v.as_str().map(ToOwned::to_owned) });
        }
        if let Some(v) = &req.workflow_id {
            q = q.bind(if v.is_null() { None::<String> } else { v.as_str().map(ToOwned::to_owned) });
        }
        if let Some(v) = &req.action { q = q.bind(v); }
        if let Some(v) = req.enabled { q = q.bind(v as i64); }
        q = q.bind(id);

        let result = q.execute(self.pool.as_ref()).await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("approval rule '{id}' not found")));
        }

        self.get_rule(id).await
    }

    /// Delete a rule by ID. Returns error if not found.
    pub async fn delete_rule(&self, id: &str) -> Result<()> {
        let result = sqlx::query("DELETE FROM approval_rules WHERE id = ?1")
            .bind(id)
            .execute(self.pool.as_ref())
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("approval rule '{id}' not found")));
        }
        Ok(())
    }

    // ---- Audit log --------------------------------------------------------

    /// Insert an audit log entry for an automated (rule-matched) decision.
    pub async fn log_auto_decision(
        &self,
        run_id: &str,
        tool_name: &str,
        approved: bool,
        rule_id: &str,
        context: Option<serde_json::Value>,
    ) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        let decision = if approved { "auto_approved" } else { "auto_rejected" };
        let context_str = context.map(|v| v.to_string());

        sqlx::query(
            "INSERT INTO approval_audit_log \
             (id, run_id, tool_name, decision, rule_id, decided_by, context) \
             VALUES (?1, ?2, ?3, ?4, ?5, 'system', ?6)",
        )
        .bind(&id)
        .bind(run_id)
        .bind(tool_name)
        .bind(decision)
        .bind(rule_id)
        .bind(context_str)
        .execute(self.pool.as_ref())
        .await?;

        Ok(())
    }

    /// Insert an audit log entry for a human approval decision.
    pub async fn log_human_decision(
        &self,
        run_id: &str,
        tool_name: &str,
        approved: bool,
        context: Option<serde_json::Value>,
    ) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        let decision = if approved { "approved" } else { "rejected" };
        let context_str = context.map(|v| v.to_string());

        sqlx::query(
            "INSERT INTO approval_audit_log \
             (id, run_id, tool_name, decision, rule_id, decided_by, context) \
             VALUES (?1, ?2, ?3, ?4, NULL, 'human', ?5)",
        )
        .bind(&id)
        .bind(run_id)
        .bind(tool_name)
        .bind(decision)
        .bind(context_str)
        .execute(self.pool.as_ref())
        .await?;

        Ok(())
    }

    /// Query audit log entries. Optionally filter by run_id; paginated by limit.
    pub async fn list_audit_log(
        &self,
        run_id: Option<&str>,
        limit: i64,
    ) -> Result<Vec<AuditLogEntry>> {
        let rows = if let Some(rid) = run_id {
            sqlx::query(
                "SELECT id, run_id, tool_name, decision, rule_id, decided_by, decided_at, context \
                 FROM approval_audit_log \
                 WHERE run_id = ?1 \
                 ORDER BY decided_at DESC \
                 LIMIT ?2",
            )
            .bind(rid)
            .bind(limit)
            .fetch_all(self.pool.as_ref())
            .await?
        } else {
            sqlx::query(
                "SELECT id, run_id, tool_name, decision, rule_id, decided_by, decided_at, context \
                 FROM approval_audit_log \
                 ORDER BY decided_at DESC \
                 LIMIT ?1",
            )
            .bind(limit)
            .fetch_all(self.pool.as_ref())
            .await?
        };

        Ok(rows.into_iter().map(|row| AuditLogEntry {
            id: row.get("id"),
            run_id: row.get("run_id"),
            tool_name: row.get("tool_name"),
            decision: row.get("decision"),
            rule_id: row.get("rule_id"),
            decided_by: row.get("decided_by"),
            decided_at: row.get("decided_at"),
            context: row.get("context"),
        }).collect())
    }
}

// ---------------------------------------------------------------------------
// Response types (also used by API routes)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct AuditLogEntry {
    pub id: String,
    pub run_id: String,
    pub tool_name: String,
    pub decision: String,
    pub rule_id: Option<String>,
    pub decided_by: Option<String>,
    pub decided_at: String,
    pub context: Option<String>,
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

fn rule_from_row(row: &sqlx::sqlite::SqliteRow) -> Result<ApprovalRule> {
    let action_str: String = row.get("action");
    let action = RuleAction::parse(&action_str)?;
    let enabled_int: i64 = row.get("enabled");
    Ok(ApprovalRule {
        id: row.get("id"),
        name: row.get("name"),
        priority: row.get("priority"),
        tool_name_pattern: row.get("tool_name_pattern"),
        cost_threshold_tokens: row.get("cost_threshold_tokens"),
        agent_id: row.get("agent_id"),
        workflow_id: row.get("workflow_id"),
        action,
        enabled: enabled_int != 0,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- matches_glob ---

    #[test]
    fn glob_prefix_wildcard_matches() {
        assert!(matches_glob("bash*", "bash_execute"));
        assert!(matches_glob("bash*", "bash_run"));
        assert!(matches_glob("bash*", "bash"));
        assert!(!matches_glob("bash*", "read_file"));
        assert!(!matches_glob("bash*", "abash_run"));
    }

    #[test]
    fn glob_suffix_wildcard_matches() {
        assert!(matches_glob("*_file", "read_file"));
        assert!(matches_glob("*_file", "write_file"));
        assert!(!matches_glob("*_file", "bash_execute"));
    }

    #[test]
    fn glob_star_matches_everything() {
        assert!(matches_glob("*", "anything"));
        assert!(matches_glob("*", ""));
    }

    #[test]
    fn glob_no_wildcard_exact_match() {
        assert!(matches_glob("read_file", "read_file"));
        assert!(!matches_glob("read_file", "read_files"));
        assert!(!matches_glob("read_file", "write_file"));
    }

    #[test]
    fn glob_middle_wildcard() {
        assert!(matches_glob("read*file", "read_large_file"));
        assert!(matches_glob("read*file", "readfile"));
        assert!(!matches_glob("read*file", "write_file"));
    }

    // --- evaluate_rules ---

    fn make_rule(
        id: &str,
        priority: i64,
        pattern: Option<&str>,
        cost: Option<i64>,
        action: RuleAction,
    ) -> ApprovalRule {
        ApprovalRule {
            id: id.to_owned(),
            name: id.to_owned(),
            priority,
            tool_name_pattern: pattern.map(ToOwned::to_owned),
            cost_threshold_tokens: cost,
            agent_id: None,
            workflow_id: None,
            action,
            enabled: true,
            created_at: "2026-01-01T00:00:00.000Z".to_owned(),
            updated_at: "2026-01-01T00:00:00.000Z".to_owned(),
        }
    }

    fn ctx(tool: &str, tokens: i64) -> ApprovalContext {
        ApprovalContext {
            tool_name: tool.to_owned(),
            agent_id: None,
            workflow_id: None,
            estimated_tokens: tokens,
        }
    }

    #[test]
    fn rule_matches_bash_pattern() {
        let rules = vec![make_rule("r1", 0, Some("bash*"), None, RuleAction::AutoApprove)];
        let matched = evaluate_rules(&rules, &ctx("bash_execute", 0));
        assert_eq!(matched.map(|r| r.id.as_str()), Some("r1"));
    }

    #[test]
    fn rule_does_not_match_different_tool() {
        let rules = vec![make_rule("r1", 0, Some("bash*"), None, RuleAction::AutoApprove)];
        let matched = evaluate_rules(&rules, &ctx("read_file", 0));
        assert!(matched.is_none());
    }

    #[test]
    fn rule_matches_cost_threshold_exceeded() {
        // Rule triggers when tokens > 1000
        let rules = vec![make_rule("r1", 0, None, Some(1000), RuleAction::AutoReject)];
        assert!(evaluate_rules(&rules, &ctx("any_tool", 1001)).is_some());
        assert!(evaluate_rules(&rules, &ctx("any_tool", 1000)).is_none()); // equal = no match
        assert!(evaluate_rules(&rules, &ctx("any_tool", 500)).is_none());
    }

    #[test]
    fn disabled_rule_is_skipped() {
        let mut rule = make_rule("r1", 0, Some("*"), None, RuleAction::AutoApprove);
        rule.enabled = false;
        let rules = vec![rule];
        assert!(evaluate_rules(&rules, &ctx("bash_execute", 0)).is_none());
    }

    #[test]
    fn highest_priority_rule_wins() {
        // Rules pre-sorted by priority DESC (caller's responsibility)
        let rules = vec![
            make_rule("high", 100, Some("bash*"), None, RuleAction::AutoApprove),
            make_rule("low", 0, Some("bash*"), None, RuleAction::AutoReject),
        ];
        let matched = evaluate_rules(&rules, &ctx("bash_execute", 0));
        assert_eq!(matched.map(|r| r.id.as_str()), Some("high"));
    }

    #[test]
    fn agent_scope_filters_correctly() {
        let mut rule = make_rule("r1", 0, Some("*"), None, RuleAction::AutoApprove);
        rule.agent_id = Some("agent-1".to_owned());
        let rules = vec![rule];

        let mut ctx_match = ctx("bash_execute", 0);
        ctx_match.agent_id = Some("agent-1".to_owned());

        let mut ctx_miss = ctx("bash_execute", 0);
        ctx_miss.agent_id = Some("agent-2".to_owned());

        assert!(evaluate_rules(&rules, &ctx_match).is_some());
        assert!(evaluate_rules(&rules, &ctx_miss).is_none());
    }
}
```

- [ ] 2.2 Run `cargo test -p rushdino-server approval_rules_store` to verify all tests pass
- [ ] 2.3 Commit: `feat(server): add approval rules store and glob rule evaluator`

---

## Task 3: Wire Rule Evaluation into the Approval Gate

**Files:**
- Modify: `crates/server/src/system_broker.rs` — inject `ApprovalRulesStore`, run evaluation before `request_approval`
- Modify: `crates/server/src/lib.rs` — construct `ApprovalRulesStore` and pass to `LocalSystemBroker`
- Modify: `crates/server/src/state.rs` — add `approval_rules` field to `AppState` and `AppStateConfig`

**Steps:**

- [ ] 3.1 Add `approval_rules_store` field to `LocalSystemBroker`:

```rust
// In crates/server/src/system_broker.rs

use crate::approval_rules_store::{ApprovalContext, ApprovalRulesStore};

pub struct LocalSystemBroker {
    approval_gate: Arc<ApprovalGate>,
    input_request_gate: Arc<InputRequestGate>,
    runtime: Arc<AgentRuntime>,
    secret_vault: SharedSecretVault,
    approval_rules: Arc<ApprovalRulesStore>, // new field
}

impl LocalSystemBroker {
    pub fn new(
        approval_gate: Arc<ApprovalGate>,
        input_request_gate: Arc<InputRequestGate>,
        runtime: Arc<AgentRuntime>,
        secret_vault: SharedSecretVault,
        approval_rules: Arc<ApprovalRulesStore>, // new param
    ) -> Self {
        Self { approval_gate, input_request_gate, runtime, secret_vault, approval_rules }
    }
```

- [ ] 3.2 Modify `ensure_approval` to evaluate rules before calling `request_approval`:

```rust
// In LocalSystemBroker::ensure_approval, after the dangerous command check
// and before the approval_gate.request_approval call:

// --- Rule evaluation ---
let eval_ctx = ApprovalContext {
    tool_name: "bash".to_owned(),
    agent_id: None,   // future: pass from ShellExecRequest
    workflow_id: None,
    estimated_tokens: 0, // future: wire from run token counters
};

let active_rules = self.approval_rules.list_active_rules().await.unwrap_or_default();
if let Some(matched_rule) = crate::approval_rules_store::evaluate_rules(&active_rules, &eval_ctx) {
    let run_id_str = request.run_id.as_deref().unwrap_or("unknown");
    let args_ctx = serde_json::json!({
        "command": request.command,
        "cwd": cwd.display().to_string(),
    });

    match matched_rule.action {
        crate::approval_rules_store::RuleAction::AutoApprove => {
            tracing::info!(
                rule_id = %matched_rule.id,
                rule_name = %matched_rule.name,
                tool = "bash",
                "approval rule auto-approved tool call"
            );
            let _ = self.approval_rules
                .log_auto_decision(run_id_str, "bash", true, &matched_rule.id, Some(args_ctx))
                .await;
            return Ok(());
        }
        crate::approval_rules_store::RuleAction::AutoReject => {
            tracing::warn!(
                rule_id = %matched_rule.id,
                rule_name = %matched_rule.name,
                tool = "bash",
                "approval rule auto-rejected tool call"
            );
            let _ = self.approval_rules
                .log_auto_decision(run_id_str, "bash", false, &matched_rule.id, Some(args_ctx))
                .await;
            return Err(AppError::Agent(format!(
                "tool 'bash' rejected by approval rule '{}'",
                matched_rule.name
            )));
        }
        crate::approval_rules_store::RuleAction::RequireHuman => {
            // Fall through to human approval below
        }
    }
}
// --- End rule evaluation; fall through to human approval ---
```

- [ ] 3.3 Add `approval_rules: Arc<ApprovalRulesStore>` to `AppState` and `AppStateConfig` in `crates/server/src/state.rs`

- [ ] 3.4 In `crates/server/src/lib.rs`, construct `ApprovalRulesStore` using the existing pool and pass it to `LocalSystemBroker::new`:

```rust
// In the build_app function, where pool is available:
let approval_rules = ApprovalRulesStore::new(pool.clone());
// Pass to LocalSystemBroker::new(..., approval_rules.clone())
// Also add to AppStateConfig { ..., approval_rules }
```

- [ ] 3.5 Write integration test verifying that a run with an `auto_approve` rule for `bash*` completes without human interaction:

```rust
#[tokio::test]
async fn auto_approve_rule_bypasses_human_gate() {
    // Create an ApprovalRulesStore with an in-memory SQLite pool
    // Insert a rule: tool_name_pattern = "bash*", action = "auto_approve"
    // Create a LocalSystemBroker with that store
    // Call ensure_approval with a dangerous bash command
    // Assert: Ok(()) returned immediately without touching approval_gate
}
```

- [ ] 3.6 Run `cargo test -p rushdino-server` to verify no regressions
- [ ] 3.7 Commit: `feat(server): wire approval rules evaluator into shell exec approval gate`

---

## Task 4: Audit Log for Human Approval Decisions

**Files:**
- Modify: `crates/server/src/routes/approval.rs` — write audit log entry in `resolve_approval`

**Steps:**

- [ ] 4.1 Inject `ApprovalRulesStore` into `AppState` (done in Task 3.3) and use it in `resolve_approval`:

```rust
// In crates/server/src/routes/approval.rs, inside resolve_approval handler,
// after gate.resolve() succeeds and the runtime_logs.insert() call:

let run_id_for_audit = request.run_id.as_deref().unwrap_or("unknown");
let args_ctx = serde_json::json!({
    "requestId": request_id.clone(),
    "sessionId": body.session_id.clone(),
    "args": request.args,
});

let _ = state.approval_rules
    .log_human_decision(
        run_id_for_audit,
        &request.tool,
        body.approved,
        Some(args_ctx),
    )
    .await;
```

- [ ] 4.2 Write test: resolve_approval stores audit entry with `decided_by = 'human'`:

```rust
#[tokio::test]
async fn human_approval_writes_audit_log() {
    // Create real in-memory SQLite pool with migrations run
    // Create ApprovalRulesStore
    // Create ApprovalGate, register session, send request
    // Call resolve with approved = true
    // Query approval_audit_log, assert entry exists with decided_by = 'human', decision = 'approved'
}
```

- [ ] 4.3 Run `cargo test -p rushdino-server approval` to verify
- [ ] 4.4 Commit: `feat(server): log human approval decisions to approval_audit_log`

---

## Task 5: CRUD API for Approval Rules

**Files:**
- Create: `crates/server/src/routes/approval_rules.rs`
- Modify: `crates/server/src/routes/mod.rs` — add `pub mod approval_rules;`
- Modify: `crates/server/src/lib.rs` — register all 5 routes

**Steps:**

- [ ] 5.1 Create the routes file:

```rust
//! CRUD API for approval policy rules and audit log access.
//!
//! Routes:
//!   GET    /api/approval-rules              → list all rules
//!   POST   /api/approval-rules              → create rule
//!   PUT    /api/approval-rules/:id          → update rule
//!   DELETE /api/approval-rules/:id          → delete rule
//!   GET    /api/approval-rules/audit-log    → query audit log

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use rushdino_common::Result;

use crate::approval_rules_store::{ApprovalRule, AuditLogEntry, CreateRuleRequest, UpdateRuleRequest};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct AuditLogQuery {
    pub run_id: Option<String>,
    pub limit: Option<i64>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/approval-rules — list all rules ordered by priority DESC.
pub async fn list_rules(
    State(state): State<AppState>,
) -> Result<Json<Vec<ApprovalRule>>> {
    let rules = state.approval_rules.list_all_rules().await?;
    Ok(Json(rules))
}

/// POST /api/approval-rules — create a new rule.
pub async fn create_rule(
    State(state): State<AppState>,
    Json(body): Json<CreateRuleRequest>,
) -> Result<Json<ApprovalRule>> {
    let rule = state.approval_rules.create_rule(body).await?;
    Ok(Json(rule))
}

/// PUT /api/approval-rules/:id — update an existing rule.
pub async fn update_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateRuleRequest>,
) -> Result<Json<ApprovalRule>> {
    let rule = state.approval_rules.update_rule(&id, body).await?;
    Ok(Json(rule))
}

/// DELETE /api/approval-rules/:id — delete a rule.
pub async fn delete_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode> {
    state.approval_rules.delete_rule(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/approval-rules/audit-log?run_id=...&limit=50 — query the audit log.
pub async fn get_audit_log(
    State(state): State<AppState>,
    Query(params): Query<AuditLogQuery>,
) -> Result<Json<Vec<AuditLogEntry>>> {
    let limit = params.limit.unwrap_or(50).min(500);
    let entries = state.approval_rules
        .list_audit_log(params.run_id.as_deref(), limit)
        .await?;
    Ok(Json(entries))
}
```

- [ ] 5.2 Add `pub mod approval_rules;` to `crates/server/src/routes/mod.rs`

- [ ] 5.3 Register routes in `crates/server/src/lib.rs` (in the `build_app` function alongside the existing `/api/approvals` routes):

```rust
.route(
    "/api/approval-rules",
    get(routes::approval_rules::list_rules).post(routes::approval_rules::create_rule),
)
.route(
    "/api/approval-rules/audit-log",
    get(routes::approval_rules::get_audit_log),
)
.route(
    "/api/approval-rules/:id",
    axum::routing::put(routes::approval_rules::update_rule)
        .delete(routes::approval_rules::delete_rule),
)
```

**Note:** The `/api/approval-rules/audit-log` route MUST be registered before `/api/approval-rules/:id` so axum matches the literal path first.

- [ ] 5.4 Write route-level tests using `axum::test` or integration test harness. Cover:
  - `POST /api/approval-rules` creates a rule and returns it with an `id`
  - `GET /api/approval-rules` returns the created rule
  - `PUT /api/approval-rules/:id` updates `priority` field correctly
  - `DELETE /api/approval-rules/:id` returns 204 and subsequent GET returns 404
  - `GET /api/approval-rules/audit-log?limit=10` returns empty list initially

- [ ] 5.5 Run `cargo test -p rushdino-server` and verify all pass
- [ ] 5.6 Commit: `feat(server): add CRUD API for approval rules and audit log`

---

## Task 6: Frontend — Approval Rules Management Page

**Files:**
- Create: `frontend/src/lib/api/approval-rules.ts`
- Create: `frontend/src/pages/approval-rules/ApprovalRulesPage.tsx`
- Create: `frontend/src/pages/approval-rules/approval-rules-types.ts`
- Create: `frontend/src/pages/approval-rules/approval-rules-form-modal.tsx`
- Create: `frontend/src/pages/approval-rules/approval-rules-table.tsx`
- Modify: `frontend/src/lib/api/index.ts` — add `export * from './approval-rules';`
- Modify: `frontend/src/lib/navigation.ts` — add sidebar item under `operations`
- Modify: `frontend/src/App.tsx` — lazy-load page and add route

**Steps:**

- [ ] 6.1 Create `frontend/src/lib/api/approval-rules.ts`:

```typescript
// Approval Rules API — CRUD for policy rules and audit log access.

import { parseJsonOrThrow } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RuleAction = 'auto_approve' | 'auto_reject' | 'require_human';

export interface ApprovalRule {
  id: string;
  name: string;
  priority: number;
  tool_name_pattern: string | null;
  cost_threshold_tokens: number | null;
  agent_id: string | null;
  workflow_id: string | null;
  action: RuleAction;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateApprovalRuleInput {
  name: string;
  priority: number;
  tool_name_pattern: string | null;
  cost_threshold_tokens: number | null;
  agent_id: string | null;
  workflow_id: string | null;
  action: RuleAction;
  enabled: boolean;
}

export interface UpdateApprovalRuleInput {
  name?: string;
  priority?: number;
  tool_name_pattern?: string | null;
  cost_threshold_tokens?: number | null;
  agent_id?: string | null;
  workflow_id?: string | null;
  action?: RuleAction;
  enabled?: boolean;
}

export interface AuditLogEntry {
  id: string;
  run_id: string;
  tool_name: string;
  decision: 'approved' | 'rejected' | 'auto_approved' | 'auto_rejected';
  rule_id: string | null;
  decided_by: string | null;
  decided_at: string;
  context: string | null;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function listApprovalRules(): Promise<ApprovalRule[]> {
  const endpoint = '/api/approval-rules';
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function createApprovalRule(input: CreateApprovalRuleInput): Promise<ApprovalRule> {
  const endpoint = '/api/approval-rules';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function updateApprovalRule(
  id: string,
  input: UpdateApprovalRuleInput,
): Promise<ApprovalRule> {
  const endpoint = `/api/approval-rules/${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function deleteApprovalRule(id: string): Promise<void> {
  const endpoint = `/api/approval-rules/${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, { method: 'DELETE' });
  if (!response.ok) {
    await parseJsonOrThrow(response, endpoint);
  }
}

export async function listApprovalAuditLog(
  runId?: string,
  limit = 50,
): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (runId) params.set('run_id', runId);
  const endpoint = `/api/approval-rules/audit-log?${params}`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}
```

- [ ] 6.2 Create `frontend/src/pages/approval-rules/approval-rules-types.ts`:

```typescript
// Local view types for the Approval Rules page

export type { ApprovalRule, AuditLogEntry, RuleAction, CreateApprovalRuleInput } from '@/lib/api/approval-rules';

export const ACTION_LABELS: Record<string, string> = {
  auto_approve: 'Auto Approve',
  auto_reject: 'Auto Reject',
  require_human: 'Require Human',
};

export const ACTION_BADGE_CLASSES: Record<string, string> = {
  auto_approve: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  auto_reject: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  require_human: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};
```

- [ ] 6.3 Create `frontend/src/pages/approval-rules/approval-rules-form-modal.tsx`:

```tsx
// Modal form for creating and editing approval rules.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApprovalRule, CreateApprovalRuleInput, RuleAction } from './approval-rules-types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateApprovalRuleInput) => Promise<void>;
  initial?: ApprovalRule | null;
}

const DEFAULT_FORM: CreateApprovalRuleInput = {
  name: '',
  priority: 0,
  tool_name_pattern: null,
  cost_threshold_tokens: null,
  agent_id: null,
  workflow_id: null,
  action: 'require_human',
  enabled: true,
};

export function ApprovalRulesFormModal({ open, onClose, onSubmit, initial }: Props) {
  const [form, setForm] = useState<CreateApprovalRuleInput>(
    initial
      ? {
          name: initial.name,
          priority: initial.priority,
          tool_name_pattern: initial.tool_name_pattern,
          cost_threshold_tokens: initial.cost_threshold_tokens,
          agent_id: initial.agent_id,
          workflow_id: initial.workflow_id,
          action: initial.action,
          enabled: initial.enabled,
        }
      : DEFAULT_FORM,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof CreateApprovalRuleInput>(
    key: K,
    value: CreateApprovalRuleInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Rule' : 'New Approval Rule'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="ar-name">Name</Label>
            <Input
              id="ar-name"
              placeholder="e.g. Auto-approve bash commands"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              required
            />
          </div>

          {/* Action */}
          <div className="space-y-1.5">
            <Label htmlFor="ar-action">Action</Label>
            <Select
              value={form.action}
              onValueChange={(v) => setField('action', v as RuleAction)}
            >
              <SelectTrigger id="ar-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto_approve">Auto Approve</SelectItem>
                <SelectItem value="auto_reject">Auto Reject</SelectItem>
                <SelectItem value="require_human">Require Human</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tool pattern */}
          <div className="space-y-1.5">
            <Label htmlFor="ar-pattern">
              Tool Name Pattern{' '}
              <span className="text-muted-foreground text-xs">(glob, e.g. bash*)</span>
            </Label>
            <Input
              id="ar-pattern"
              placeholder="Leave empty to match all tools"
              value={form.tool_name_pattern ?? ''}
              onChange={(e) =>
                setField('tool_name_pattern', e.target.value.trim() || null)
              }
            />
          </div>

          {/* Cost threshold */}
          <div className="space-y-1.5">
            <Label htmlFor="ar-cost">
              Cost Threshold (tokens){' '}
              <span className="text-muted-foreground text-xs">(trigger when run exceeds N tokens)</span>
            </Label>
            <Input
              id="ar-cost"
              type="number"
              min={0}
              placeholder="Leave empty to ignore"
              value={form.cost_threshold_tokens ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                setField('cost_threshold_tokens', v ? Number(v) : null);
              }}
            />
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label htmlFor="ar-priority">
              Priority{' '}
              <span className="text-muted-foreground text-xs">(higher = evaluated first)</span>
            </Label>
            <Input
              id="ar-priority"
              type="number"
              value={form.priority}
              onChange={(e) => setField('priority', Number(e.target.value))}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] 6.4 Create `frontend/src/pages/approval-rules/approval-rules-table.tsx`:

```tsx
// Table of approval rules with inline enable/disable toggle and delete.

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { ApprovalRule } from './approval-rules-types';
import { ACTION_LABELS, ACTION_BADGE_CLASSES } from './approval-rules-types';

interface Props {
  rules: ApprovalRule[];
  onToggleEnabled: (rule: ApprovalRule) => Promise<void>;
  onEdit: (rule: ApprovalRule) => void;
  onDelete: (rule: ApprovalRule) => Promise<void>;
}

export function ApprovalRulesTable({ rules, onToggleEnabled, onEdit, onDelete }: Props) {
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">No approval rules configured.</p>
        <p className="text-xs mt-1">Create a rule to automate tool approval decisions.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Pattern</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Action</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Priority</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Enabled</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rules.map((rule) => {
            const busy = busyIds.has(rule.id);
            return (
              <tr
                key={rule.id}
                className="hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => onEdit(rule)}
              >
                <td className="px-4 py-3 font-medium">{rule.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {rule.tool_name_pattern ?? <span className="italic">all tools</span>}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      ACTION_BADGE_CLASSES[rule.action] ?? ''
                    }`}
                  >
                    {ACTION_LABELS[rule.action] ?? rule.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{rule.priority}</td>
                <td
                  className="px-4 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Switch
                    checked={rule.enabled}
                    disabled={busy}
                    onCheckedChange={() => withBusy(rule.id, () => onToggleEnabled(rule))}
                  />
                </td>
                <td
                  className="px-4 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    onClick={() => withBusy(rule.id, () => onDelete(rule))}
                    title="Delete rule"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] 6.5 Create `frontend/src/pages/approval-rules/ApprovalRulesPage.tsx`:

```tsx
// Approval Rules management page — list, create, edit, delete policy rules.

import { useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  listApprovalRules,
  createApprovalRule,
  updateApprovalRule,
  deleteApprovalRule,
} from '@/lib/api/approval-rules';
import type { CreateApprovalRuleInput, ApprovalRule } from './approval-rules-types';
import { ApprovalRulesTable } from './approval-rules-table';
import { ApprovalRulesFormModal } from './approval-rules-form-modal';

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

const approvalRulesKeys = {
  all: () => ['approval-rules'] as const,
  list: () => [...approvalRulesKeys.all(), 'list'] as const,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ApprovalRulesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);

  // Data fetching
  const { data: rules = [], isPending } = useQuery({
    queryKey: approvalRulesKeys.list(),
    queryFn: listApprovalRules,
  });

  // Invalidation helper
  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: approvalRulesKeys.list() });
  }

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (input: CreateApprovalRuleInput) => createApprovalRule(input),
    onSuccess: () => {
      invalidate();
      toast.success('Rule created');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateApprovalRuleInput> }) =>
      updateApprovalRule(id, input),
    onSuccess: () => {
      invalidate();
      toast.success('Rule updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteApprovalRule(id),
    onSuccess: () => {
      invalidate();
      toast.success('Rule deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Handlers
  function openCreate() {
    setEditingRule(null);
    setModalOpen(true);
  }

  function openEdit(rule: ApprovalRule) {
    setEditingRule(rule);
    setModalOpen(true);
  }

  async function handleFormSubmit(input: CreateApprovalRuleInput) {
    if (editingRule) {
      await updateMutation.mutateAsync({ id: editingRule.id, input });
    } else {
      await createMutation.mutateAsync(input);
    }
  }

  async function handleToggleEnabled(rule: ApprovalRule) {
    await updateMutation.mutateAsync({
      id: rule.id,
      input: { enabled: !rule.enabled },
    });
  }

  async function handleDelete(rule: ApprovalRule) {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;
    await deleteMutation.mutateAsync(rule.id);
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Approval Rules</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure rules to auto-approve, auto-reject, or require human review for tool calls.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Rule
        </Button>
      </div>

      {/* Rules table */}
      {isPending ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Loading rules…
        </div>
      ) : (
        <ApprovalRulesTable
          rules={rules}
          onToggleEnabled={handleToggleEnabled}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      {/* Create / Edit modal */}
      <ApprovalRulesFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleFormSubmit}
        initial={editingRule}
      />
    </div>
  );
}
```

- [ ] 6.6 Add export to `frontend/src/lib/api/index.ts`:
  - Add `export * from './approval-rules';` after the existing `export * from './approvals';` line

- [ ] 6.7 Add sidebar navigation entry in `frontend/src/lib/navigation.ts`:
  - Import `ShieldCheck` from `'lucide-react'` at the top
  - Add to the `operations` group, after the `approvals` item:

```typescript
{ id: 'approval-rules', label: 'Approval Rules', icon: ShieldCheck, href: '/approval-rules', matchPrefix: '/approval-rules', advancedOnly: true },
```

- [ ] 6.8 Register route in `frontend/src/App.tsx`:
  - Add lazy import near the `ApprovalsPage` import:
  ```typescript
  const ApprovalRulesPage = lazy(() => import('./pages/approval-rules/ApprovalRulesPage').then(m => ({ default: m.ApprovalRulesPage })));
  ```
  - Add route after the `<Route path="approvals" element={<ApprovalsPage />} />` line:
  ```tsx
  <Route path="approval-rules" element={<ApprovalRulesPage />} />
  ```

- [ ] 6.9 Verify TypeScript compiles without errors:
  ```bash
  cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit
  ```

- [ ] 6.10 Commit: `feat(ui): add approval rules management page with CRUD and toggle controls`

---

## Task 7: End-to-End Verification

**Steps:**

- [ ] 7.1 Run full backend test suite: `cargo test --workspace`
- [ ] 7.2 Start dev server and navigate to `http://localhost:5173/approval-rules`
- [ ] 7.3 Verify:
  - Page loads with empty state message
  - "New Rule" button opens modal
  - Create a rule `name="Auto-approve bash"`, `tool_name_pattern="bash*"`, `action=auto_approve`, `priority=10`
  - Rule appears in the table with green "Auto Approve" badge
  - Toggle enable/disable switch updates the rule
  - Edit the rule (click row) and change priority — verify update
  - Delete the rule — verify it disappears
- [ ] 7.4 Verify audit log endpoint: `curl http://localhost:8080/api/approval-rules/audit-log?limit=10`
- [ ] 7.5 Commit any cleanup needed: `chore: approval rules e2e verification fixes`

---

## Summary

| Task | What it delivers |
|------|-----------------|
| 1 | SQLite tables for `approval_rules` and `approval_audit_log` |
| 2 | `ApprovalRulesStore` with glob evaluator + full unit tests |
| 3 | Rule evaluation wired into `LocalSystemBroker::ensure_approval` before human gate |
| 4 | Audit log entries written when humans resolve approvals |
| 5 | REST API: GET/POST/PUT/DELETE `/api/approval-rules` + audit log query |
| 6 | React frontend: rules table, form modal, nav entry, lazy route |
| 7 | End-to-end smoke test |

**Blast radius notes:**
- `LocalSystemBroker::ensure_approval` is modified (single method, low risk — adds rule check before existing logic)
- `resolve_approval` route handler is modified (adds non-blocking audit log INSERT after existing logic)
- No changes to `ApprovalGate` struct, `ApprovalsPage`, or any existing DB schema
- New `approval_rules` field added to `AppState` (additive, no breaking changes)
