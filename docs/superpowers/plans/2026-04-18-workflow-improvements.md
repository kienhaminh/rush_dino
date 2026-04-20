# Workflow Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add workflow versioning, richer conditional expressions, webhook triggers, and dry-run validation to make workflows more powerful and production-ready.

**Architecture:** Versioning uses a `workflow_versions` table to store JSON snapshots on each update. Conditional expressions are parsed as a simple enum in workflow_runner. Webhook trigger is a new unauthenticated route (with optional HMAC). Dry-run validates the DAG without executing any steps.

**Tech Stack:** Rust, axum, sqlx (SQLite), serde_json, regex crate (already in `crates/agent/Cargo.toml`)

---

## Codebase Reference

Key files you will be modifying:

| File | Role |
|------|------|
| `crates/common/migrations/001_init.sql` | Consolidated schema (all existing tables) |
| `crates/agent/src/workflow_types.rs` | Data types shared across manager and runner |
| `crates/agent/src/workflow_manager/workflows.rs` | `update_workflow()`, CRUD ops |
| `crates/agent/src/workflow_manager/mod.rs` | `WorkflowManager` struct, shared helpers |
| `crates/agent/src/workflow_runner.rs` | DAG executor, `evaluate_condition()` fn |
| `crates/agent/src/engine_workflows.rs` | Engine-level workflow methods, delegates to manager |
| `crates/server/src/routes/workflows.rs` | Axum route handlers |
| `crates/server/src/lib.rs` | Route registration (lines ~595–610) |

**Important context:**
- Existing migration file is `crates/common/migrations/001_init.sql` (a consolidated schema). New migrations go in `002_...sql`.
- `regex = "1"` is already in `crates/agent/Cargo.toml` — no dep changes needed.
- `evaluate_condition()` in `workflow_runner.rs` is a free function at line ~580 that currently only handles `"<name>.succeeded"` / `"<name>.failed"`.
- `update_workflow()` in `workflow_manager/workflows.rs` runs inside a transaction — version snapshotting must be added within the same transaction.
- Route registration in `crates/server/src/lib.rs` follows the pattern `.route("/api/workflows/:id/runs", ...)`.
- `WorkflowDetail` and `WorkflowStep` use `#[serde(rename_all = "camelCase")]` — keep new types consistent.
- The `completed` map in `execute_run` is `HashMap<String, (String, String)>` where the tuple is `(step_name, output)` — the output string is available for `output_contains`/`output_matches` checks.

---

## Task 1: DB migration for versioning and webhook fields

**Files:**
- Create: `crates/common/migrations/002_workflow_improvements.sql`

**Steps:**

- [ ] 1.1 Create the migration file with the SQL below
- [ ] 1.2 Run `cargo test -p rushdino-common` to verify migration applies cleanly
- [ ] 1.3 Commit

**Full SQL:**

```sql
-- Migration 002: workflow versioning + webhook trigger support

-- Add version counter and webhook fields to workflows table.
ALTER TABLE workflows ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workflows ADD COLUMN webhook_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflows ADD COLUMN webhook_secret TEXT;

-- Stores full JSON snapshots of a workflow + its steps at each update.
CREATE TABLE IF NOT EXISTS workflow_versions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    snapshot TEXT NOT NULL,  -- JSON: { "workflow": {...}, "steps": [...] }
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(workflow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow
    ON workflow_versions(workflow_id, version DESC);
```

---

## Task 2: Snapshot workflow on update (versioning)

**Files:**
- `crates/agent/src/workflow_types.rs` — add `version`, `webhook_enabled`, `webhook_secret` fields
- `crates/agent/src/workflow_manager/workflows.rs` — update `update_workflow()` and row-mapping

**Steps:**

- [ ] 2.1 Write failing test in `crates/agent/src/workflow_manager/tests.rs`:
  update a workflow twice, assert `workflow_versions` has 2 rows, versions are 1 and 2
- [ ] 2.2 Add new fields to `WorkflowDetail` and `WorkflowListItem` in `workflow_types.rs`
- [ ] 2.3 Add `WorkflowVersion` response struct to `workflow_types.rs`
- [ ] 2.4 Update `update_workflow()` to snapshot before update (within transaction)
- [ ] 2.5 Update `get_workflow()`, `map_workflow_list_item()` row-mapping to select new columns
- [ ] 2.6 Run test, verify PASS
- [ ] 2.7 Commit

**Code changes:**

### 2.2 + 2.3 — `workflow_types.rs` additions

```rust
// Add to WorkflowListItem
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowListItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source: WorkflowSource,
    pub status: WorkflowStatus,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
    pub step_count: i64,
    pub version: i64,              // NEW
    pub webhook_enabled: bool,     // NEW
}

// Add to WorkflowDetail
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowDetail {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source: WorkflowSource,
    pub status: WorkflowStatus,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
    pub steps: Vec<WorkflowStep>,
    pub version: i64,              // NEW
    pub webhook_enabled: bool,     // NEW
    pub webhook_secret: Option<String>, // NEW
}

// New type for version listing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowVersion {
    pub id: String,
    pub workflow_id: String,
    pub version: i64,
    pub snapshot: serde_json::Value,
    pub created_at: String,
}

// New type for UpdateWorkflow to support webhook fields
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkflowInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub status: Option<WorkflowStatus>,
    pub steps: Option<Vec<WorkflowStepInput>>,
    pub webhook_enabled: Option<bool>,   // NEW
    pub webhook_secret: Option<String>,  // NEW (None = no change, Some("") = clear)
}
```

### 2.4 — `update_workflow()` in `workflow_manager/workflows.rs`

Replace the existing `update_workflow()` method body:

```rust
pub async fn update_workflow(
    &self,
    id: &str,
    payload: UpdateWorkflowInput,
) -> Result<WorkflowDetail> {
    let existing = self.get_workflow(id).await?;

    if let Some(name) = payload.name.as_ref() {
        validate_workflow_name(name)?;
    }
    if let Some(steps) = payload.steps.as_ref() {
        validate_steps(steps)?;
    }

    let name = payload
        .name
        .as_deref()
        .map(str::trim)
        .unwrap_or(existing.name.as_str())
        .to_owned();
    let description = payload
        .description
        .as_deref()
        .map(str::trim)
        .unwrap_or(existing.description.as_str())
        .to_owned();
    let status = payload.status.unwrap_or(existing.status);
    let webhook_enabled = payload
        .webhook_enabled
        .unwrap_or(existing.webhook_enabled);
    // None = no change; Some(s) = set new secret (empty string clears it)
    let webhook_secret: Option<Option<String>> = payload.webhook_secret.map(|s| {
        if s.is_empty() { None } else { Some(s) }
    });
    let now = Utc::now().to_rfc3339();

    let mut tx = self.pool.begin().await?;

    // ── Snapshot current version before overwriting ──────────────────────────
    let snapshot = serde_json::json!({
        "workflow": {
            "id": existing.id,
            "name": existing.name,
            "description": existing.description,
            "source": existing.source.as_str(),
            "status": existing.status.as_str(),
            "version": existing.version,
        },
        "steps": existing.steps,
    });
    let snapshot_str = serde_json::to_string(&snapshot)
        .map_err(|e| rushdino_common::AppError::Internal(format!("snapshot serialize error: {e}")))?;
    let version_id = Uuid::new_v4().to_string();

    sqlx::query(
        r#"
        INSERT INTO workflow_versions (id, workflow_id, version, snapshot, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
    )
    .bind(&version_id)
    .bind(id)
    .bind(existing.version)
    .bind(&snapshot_str)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    // ── Update the workflow row, bump version ────────────────────────────────
    // Build the update conditionally based on whether webhook_secret changed.
    match webhook_secret {
        Some(new_secret) => {
            sqlx::query(
                r#"
                UPDATE workflows
                SET name = ?1, description = ?2, status = ?3, updated_at = ?4,
                    version = version + 1, webhook_enabled = ?5, webhook_secret = ?6
                WHERE id = ?7
                "#,
            )
            .bind(&name)
            .bind(&description)
            .bind(status.as_str())
            .bind(&now)
            .bind(webhook_enabled as i64)
            .bind(new_secret)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        }
        None => {
            sqlx::query(
                r#"
                UPDATE workflows
                SET name = ?1, description = ?2, status = ?3, updated_at = ?4,
                    version = version + 1, webhook_enabled = ?5
                WHERE id = ?6
                "#,
            )
            .bind(&name)
            .bind(&description)
            .bind(status.as_str())
            .bind(&now)
            .bind(webhook_enabled as i64)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        }
    }

    // ── Replace steps if provided ────────────────────────────────────────────
    if let Some(steps) = payload.steps {
        sqlx::query("DELETE FROM workflow_steps WHERE workflow_id = ?1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        for (index, step) in steps.iter().enumerate() {
            let depends_on_json = step
                .depends_on
                .as_ref()
                .map(|ids| serde_json::to_string(ids).unwrap_or_default());
            sqlx::query(
                r#"
                INSERT INTO workflow_steps
                  (id, workflow_id, position, name, instructions, agent_id, step_type,
                   created_at, updated_at, depends_on, max_retries, timeout_secs, condition)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                "#,
            )
            .bind(Uuid::new_v4().to_string())
            .bind(id)
            .bind((index + 1) as i64)
            .bind(step.name.trim())
            .bind(step.instructions.trim())
            .bind(step.agent_id.trim())
            .bind(step.step_type.as_str())
            .bind(&now)
            .bind(&now)
            .bind(depends_on_json)
            .bind(step.max_retries as i64)
            .bind(step.timeout_secs.map(|t| t as i64))
            .bind(step.condition.as_deref())
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;
    self.get_workflow(id).await
}
```

### 2.5 — Update `get_workflow()` and `map_workflow_list_item()` row-mapping

In `get_workflow()`, update the SELECT query:
```sql
SELECT id, name, description, source, status, created_by, created_at, updated_at,
       version, webhook_enabled, webhook_secret
FROM workflows
WHERE id = ?1
```

And map the new fields in the `WorkflowDetail` construction:
```rust
Ok(WorkflowDetail {
    // ... existing fields ...
    version: workflow_row.get::<i64, _>("version"),
    webhook_enabled: workflow_row.get::<i64, _>("webhook_enabled") != 0,
    webhook_secret: workflow_row.get::<Option<String>, _>("webhook_secret"),
    steps: step_rows.into_iter().map(map_workflow_step).collect::<Result<_>>()?,
})
```

In `list_workflows()`, update the SELECT to include `w.version, w.webhook_enabled` and map them in `map_workflow_list_item`:
```rust
fn map_workflow_list_item(row: sqlx::sqlite::SqliteRow) -> Result<WorkflowListItem> {
    use sqlx::Row;
    Ok(WorkflowListItem {
        // ... existing fields ...
        version: row.get::<i64, _>("version"),
        webhook_enabled: row.get::<i64, _>("webhook_enabled") != 0,
    })
}
```

---

## Task 3: GET /api/workflows/{id}/versions endpoint

**Files:**
- `crates/agent/src/workflow_manager/mod.rs` — add `get_workflow_versions()` method
- `crates/agent/src/engine_workflows.rs` — expose via engine
- `crates/server/src/routes/workflows.rs` — add route handler
- `crates/server/src/lib.rs` — register route

**Steps:**

- [ ] 3.1 Write integration test: create workflow → update it → GET `/api/workflows/{id}/versions` → assert 1 snapshot returned with correct `version` field
- [ ] 3.2 Add `get_workflow_versions()` to `WorkflowManager`
- [ ] 3.3 Add engine-level delegation in `engine_workflows.rs`
- [ ] 3.4 Add route handler in `routes/workflows.rs`
- [ ] 3.5 Register route in `lib.rs`
- [ ] 3.6 Run test, verify PASS
- [ ] 3.7 Commit

**Code changes:**

### 3.2 — `workflow_manager/mod.rs` (or a new `versions.rs` sub-module)

Add in `workflow_manager/workflows.rs` (or a new `workflow_manager/versions.rs`):

```rust
impl WorkflowManager {
    /// Return all stored versions for a workflow, newest first.
    pub async fn get_workflow_versions(
        &self,
        workflow_id: &str,
    ) -> Result<Vec<WorkflowVersion>> {
        use sqlx::Row;

        // Verify workflow exists first.
        let exists = sqlx::query("SELECT 1 FROM workflows WHERE id = ?1")
            .bind(workflow_id)
            .fetch_optional(self.pool.as_ref())
            .await?;
        if exists.is_none() {
            return Err(rushdino_common::AppError::NotFound(
                format!("workflow {workflow_id} not found")
            ));
        }

        let rows = sqlx::query(
            r#"
            SELECT id, workflow_id, version, snapshot, created_at
            FROM workflow_versions
            WHERE workflow_id = ?1
            ORDER BY version DESC
            "#,
        )
        .bind(workflow_id)
        .fetch_all(self.pool.as_ref())
        .await?;

        rows.into_iter()
            .map(|row| {
                let snapshot_str: String = row.get("snapshot");
                let snapshot: serde_json::Value = serde_json::from_str(&snapshot_str)
                    .map_err(|e| rushdino_common::AppError::Internal(
                        format!("snapshot deserialize error: {e}")
                    ))?;
                Ok(WorkflowVersion {
                    id: row.get("id"),
                    workflow_id: row.get("workflow_id"),
                    version: row.get("version"),
                    snapshot,
                    created_at: row.get("created_at"),
                })
            })
            .collect()
    }
}
```

### 3.3 — `engine_workflows.rs` delegation

```rust
pub async fn get_workflow_versions(
    &self,
    workflow_id: &str,
) -> Result<Vec<rushdino_agent::WorkflowVersion>> {
    self.workflow_manager.get_workflow_versions(workflow_id).await
}
```

### 3.4 — Route handler in `routes/workflows.rs`

```rust
pub async fn get_workflow_versions(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let versions = engine.get_workflow_versions(&id).await?;
    Ok(Json(serde_json::json!({ "items": versions })))
}
```

### 3.5 — Route registration in `lib.rs`

After the existing `"/api/workflows/:id/runs"` route block, add:
```rust
.route(
    "/api/workflows/:id/versions",
    get(routes::workflows::get_workflow_versions),
)
```

---

## Task 4: Extended conditional expressions

**Files:**
- `crates/agent/src/workflow_runner.rs` — replace `evaluate_condition()` and `StepDisposition`

**Steps:**

- [ ] 4.1 Write test: step with `condition = "prev_step.output_contains:SUCCESS"` — mock step output containing "SUCCESS" → verify runs; without it → verify skipped
- [ ] 4.2 Write test: `condition = "prev_step.output_matches:^OK.*"` — regex match
- [ ] 4.3 Write test: malformed regex in `output_matches` → condition evaluates to `false` (no panic)
- [ ] 4.4 Replace the `evaluate_condition()` free function with the new implementation below
- [ ] 4.5 Run all workflow tests: `cargo test -p rushdino-agent workflow`
- [ ] 4.6 Commit

**Code changes:**

### 4.4 — New `evaluate_condition()` in `workflow_runner.rs`

Replace the existing `evaluate_condition` function (lines ~572–614) and add the `Condition` enum above it:

```rust
/// Parsed representation of a step condition expression.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Condition {
    /// `"<name>.succeeded"` — runs if dep succeeded.
    StepSucceeded(String),
    /// `"<name>.failed"` — runs if dep failed or was skipped.
    StepFailed(String),
    /// `"<name>.output_contains:<text>"` — runs if dep's output contains literal text.
    OutputContains { step: String, text: String },
    /// `"<name>.output_matches:<regex>"` — runs if dep's output matches a regex pattern.
    OutputMatches { step: String, pattern: String },
}

/// Parse a condition string into a typed `Condition`.
///
/// Supported formats:
/// - `"<name>.succeeded"`
/// - `"<name>.failed"`
/// - `"<name>.output_contains:<literal_text>"`
/// - `"<name>.output_matches:<regex_pattern>"`
///
/// Returns `None` for any unrecognised format.
fn parse_condition(s: &str) -> Option<Condition> {
    // Split on the first '.' only to get (step_name, rest).
    let (step, rest) = s.split_once('.')?;
    let step = step.to_owned();

    if rest == "succeeded" {
        return Some(Condition::StepSucceeded(step));
    }
    if rest == "failed" {
        return Some(Condition::StepFailed(step));
    }
    if let Some(text) = rest.strip_prefix("output_contains:") {
        return Some(Condition::OutputContains { step, text: text.to_owned() });
    }
    if let Some(pattern) = rest.strip_prefix("output_matches:") {
        return Some(Condition::OutputMatches { step, pattern: pattern.to_owned() });
    }

    None
}

/// Evaluate a step condition string.
///
/// Returns `true` when the step should be dispatched, `false` when it should be skipped.
///
/// `completed` maps step_id → (step_name, output).  
/// `skipped` / `failed` contain step_ids.  
/// `step_id_by_name` maps step_name → step_id for name resolution.
fn evaluate_condition(
    condition: &str,
    completed: &HashMap<String, (String, String)>,
    skipped: &HashSet<String>,
    failed: &HashSet<String>,
    step_id_by_name: &HashMap<String, String>,
) -> bool {
    let parsed = match parse_condition(condition) {
        Some(c) => c,
        None => {
            tracing::warn!(condition = %condition, "unrecognised condition format — skipping step");
            return false;
        }
    };

    // Resolve the dependency step name to its ID.
    let dep_name = match &parsed {
        Condition::StepSucceeded(n) => n,
        Condition::StepFailed(n) => n,
        Condition::OutputContains { step, .. } => step,
        Condition::OutputMatches { step, .. } => step,
    };
    let dep_id = match step_id_by_name.get(dep_name.as_str()) {
        Some(id) => id,
        None => {
            tracing::warn!(
                dep = %dep_name,
                "condition references unknown step name — skipping"
            );
            return false;
        }
    };

    // Determine terminal disposition of the dependency.
    let dep_output: Option<&str> = completed.get(dep_id.as_str()).map(|(_, out)| out.as_str());
    let dep_succeeded = dep_output.is_some();
    let dep_failed_or_skipped =
        failed.contains(dep_id.as_str()) || skipped.contains(dep_id.as_str());

    // If dep is still in-flight, caller should not reach here.
    if !dep_succeeded && !dep_failed_or_skipped {
        return false;
    }

    match parsed {
        Condition::StepSucceeded(_) => dep_succeeded,
        Condition::StepFailed(_) => dep_failed_or_skipped,
        Condition::OutputContains { text, .. } => {
            dep_output.map(|out| out.contains(text.as_str())).unwrap_or(false)
        }
        Condition::OutputMatches { pattern, .. } => {
            let output = match dep_output {
                Some(o) => o,
                None => return false,
            };
            match regex::Regex::new(&pattern) {
                Ok(re) => re.is_match(output),
                Err(e) => {
                    tracing::warn!(pattern = %pattern, error = %e, "invalid regex in condition — skipping step");
                    false
                }
            }
        }
    }
}
```

---

## Task 5: Webhook trigger endpoint

**Files:**
- `crates/agent/src/workflow_manager/runs.rs` — add `create_run_for_webhook()`
- `crates/agent/src/engine_workflows.rs` — add `trigger_workflow_webhook()`
- `crates/server/src/routes/workflows.rs` — add `trigger_workflow_webhook` handler
- `crates/server/src/lib.rs` — register new route

**Steps:**

- [ ] 5.1 Write test: POST `/api/workflows/{id}/trigger` with `webhook_enabled = true`, no secret → verify 200, run_id returned
- [ ] 5.2 Write test: POST `/api/workflows/{id}/trigger` with `webhook_enabled = false` → verify 403
- [ ] 5.3 Write test: POST `/api/workflows/{id}/trigger` with `webhook_secret` set but wrong `X-Hub-Signature-256` header → verify 401
- [ ] 5.4 Write test: POST with correct HMAC signature → verify 200
- [ ] 5.5 Implement manager-level `check_webhook_auth()` helper and `create_run_for_webhook()`
- [ ] 5.6 Implement engine method
- [ ] 5.7 Implement route handler
- [ ] 5.8 Register route
- [ ] 5.9 Run tests, verify PASS
- [ ] 5.10 Commit

**Code changes:**

### 5.5 — `workflow_manager/runs.rs` additions

```rust
use rushdino_security::hmac_sha256_hex;  // or use sha2 + hmac directly

impl WorkflowManager {
    /// Verify webhook authentication for a workflow.
    ///
    /// If `webhook_enabled = false` → `Err(AppError::Forbidden)`.
    /// If `webhook_secret` is set → validate HMAC-SHA256 from `X-Hub-Signature-256` header.
    /// If no secret configured → allow unauthenticated.
    pub async fn check_webhook_auth(
        &self,
        workflow_id: &str,
        signature_header: Option<&str>,
        raw_body: &[u8],
    ) -> Result<()> {
        use sqlx::Row;

        let row = sqlx::query(
            "SELECT webhook_enabled, webhook_secret FROM workflows WHERE id = ?1",
        )
        .bind(workflow_id)
        .fetch_optional(self.pool.as_ref())
        .await?
        .ok_or_else(|| rushdino_common::AppError::NotFound(
            format!("workflow {workflow_id} not found")
        ))?;

        let enabled: i64 = row.get("webhook_enabled");
        if enabled == 0 {
            return Err(rushdino_common::AppError::Forbidden(
                "webhook trigger is not enabled for this workflow".to_owned(),
            ));
        }

        let secret: Option<String> = row.get("webhook_secret");
        if let Some(secret) = secret {
            // Validate HMAC-SHA256 — header format: "sha256=<hex_digest>"
            let expected = compute_hmac_sha256_hex(secret.as_bytes(), raw_body);
            let provided = signature_header.unwrap_or("");
            let provided_hash = provided.strip_prefix("sha256=").unwrap_or("");

            // Use constant-time comparison to prevent timing attacks.
            if !constant_time_eq(expected.as_bytes(), provided_hash.as_bytes()) {
                return Err(rushdino_common::AppError::Unauthorized(
                    "invalid webhook signature".to_owned(),
                ));
            }
        }

        Ok(())
    }
}

/// Compute HMAC-SHA256 and return lower-hex string.
/// Uses the `hmac` + `sha2` crates (add to Cargo.toml if not present).
fn compute_hmac_sha256_hex(key: &[u8], data: &[u8]) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let mut mac = Hmac::<Sha256>::new_from_slice(key)
        .expect("HMAC accepts any key length");
    mac.update(data);
    let result = mac.finalize().into_bytes();
    result.iter().map(|b| format!("{b:02x}")).collect()
}

/// Constant-time byte comparison (prevents timing oracle on HMAC).
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}
```

**Note:** Add `hmac = "0.12"` and `sha2 = "0.10"` to `crates/agent/Cargo.toml` if not already present. Check `Cargo.lock` / workspace `Cargo.toml` first — they may already be transitive deps.

### 5.6 — `engine_workflows.rs` webhook method

```rust
/// Trigger a workflow via webhook.
///
/// Validates auth, then creates a queued run and spawns execution.
/// `raw_body` is passed for HMAC validation (use the raw request bytes before JSON parsing).
pub async fn trigger_workflow_webhook(
    &self,
    workflow_id: &str,
    signature_header: Option<&str>,
    raw_body: &[u8],
    run_input: &str,
) -> Result<WorkflowRunStartResponse> {
    // Auth check first — before creating any DB rows.
    self.workflow_manager
        .check_webhook_auth(workflow_id, signature_header, raw_body)
        .await?;

    let workflow = self.workflow_manager.get_workflow(workflow_id).await?;
    let run = self
        .workflow_manager
        .create_run(workflow_id, "webhook", run_input)
        .await?;
    self.runtime
        .register_workflow_run(
            &run.run_id,
            workflow_id,
            &workflow.name,
            Some(run_input),
            &self.provider_name,
            self.provider.model(),
        )
        .await?;
    self.workflow_runner.spawn_run(run.run_id.clone());
    Ok(run)
}
```

### 5.7 — Route handler in `routes/workflows.rs`

The handler must read the raw body bytes for HMAC, then parse JSON from them.

```rust
use axum::body::Bytes;
use axum::http::HeaderMap;

pub async fn trigger_workflow_webhook(
    Path(id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<rushdino_agent::WorkflowRunStartResponse>> {
    let engine = state.engine()?;

    let signature = headers
        .get("x-hub-signature-256")
        .and_then(|v| v.to_str().ok());

    // Parse optional JSON body for a run `input` field.
    let run_input = if body.is_empty() {
        String::new()
    } else {
        serde_json::from_slice::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v.get("input").and_then(|i| i.as_str()).map(str::to_owned))
            .unwrap_or_default()
    };

    let response = engine
        .trigger_workflow_webhook(&id, signature, &body, &run_input)
        .await?;

    Ok(Json(response))
}
```

### 5.8 — Route registration in `lib.rs`

```rust
.route(
    "/api/workflows/:id/trigger",
    post(routes::workflows::trigger_workflow_webhook),
)
```

**Important:** The `/api/workflows/:id/trigger` route must be **outside** any authentication middleware layer if one exists. Check `lib.rs` for middleware layering (e.g. `layer(auth_middleware)`) and ensure this route is in the unauthenticated section.

---

## Task 6: Dry-run mode

**Files:**
- `crates/agent/src/workflow_types.rs` — add `DryRunReport` struct
- `crates/agent/src/workflow_manager/mod.rs` — add `validate_workflow_dag()` method
- `crates/agent/src/engine_workflows.rs` — update `start_workflow_run()` to handle dry_run
- `crates/server/src/routes/workflows.rs` — update `StartWorkflowRunRequest` and `start_workflow_run` handler

**Steps:**

- [ ] 6.1 Write test: POST `/api/workflows/{id}/run` with `{"dry_run": true}` on a valid workflow — assert no `workflow_runs` row created, response contains `{ "valid": true, "errors": [], "step_count": N }`
- [ ] 6.2 Write test: dry_run on workflow with a step referencing a non-existent `depends_on` step ID → assert `valid: false`, errors array non-empty
- [ ] 6.3 Write test: dry_run on workflow with a circular dependency → assert `valid: false`, error mentions cycle
- [ ] 6.4 Add `DryRunReport` struct to `workflow_types.rs`
- [ ] 6.5 Implement `validate_workflow_dag()` on `WorkflowManager`
- [ ] 6.6 Update engine `start_workflow_run()` to accept `dry_run: bool`
- [ ] 6.7 Update route handler
- [ ] 6.8 Run tests, verify PASS
- [ ] 6.9 Commit

**Code changes:**

### 6.4 — `DryRunReport` in `workflow_types.rs`

```rust
/// Result of a dry-run validation — returned instead of creating an actual run.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DryRunReport {
    /// `true` if the workflow is valid and could be executed.
    pub valid: bool,
    /// Human-readable error descriptions. Empty when `valid = true`.
    pub errors: Vec<String>,
    /// Total number of steps in the workflow.
    pub step_count: usize,
}
```

### 6.5 — `validate_workflow_dag()` in `workflow_manager/mod.rs`

```rust
impl WorkflowManager {
    /// Validate a workflow DAG without executing it.
    ///
    /// Checks performed:
    /// 1. Workflow exists and is in `active` status.
    /// 2. All steps reference agent_ids that exist in the `agents` table.
    /// 3. All `depends_on` step IDs reference real steps within the same workflow.
    /// 4. No circular dependencies in the step DAG.
    pub async fn validate_workflow_dag(&self, workflow_id: &str) -> Result<DryRunReport> {
        use sqlx::Row;
        use std::collections::{HashMap, HashSet, VecDeque};

        let mut errors: Vec<String> = Vec::new();

        // ── 1. Fetch workflow ──────────────────────────────────────────────
        let wf_row = sqlx::query(
            "SELECT status FROM workflows WHERE id = ?1",
        )
        .bind(workflow_id)
        .fetch_optional(self.pool.as_ref())
        .await?
        .ok_or_else(|| rushdino_common::AppError::NotFound(
            format!("workflow {workflow_id} not found")
        ))?;

        let status = wf_row.get::<String, _>("status");
        if status != "active" {
            errors.push(format!("workflow is in '{status}' status (must be active to run)"));
        }

        // ── 2. Fetch steps ─────────────────────────────────────────────────
        let step_rows = sqlx::query(
            "SELECT id, name, agent_id, depends_on FROM workflow_steps WHERE workflow_id = ?1",
        )
        .bind(workflow_id)
        .fetch_all(self.pool.as_ref())
        .await?;

        let step_count = step_rows.len();
        if step_count == 0 {
            errors.push("workflow has no steps".to_owned());
            return Ok(DryRunReport { valid: errors.is_empty(), errors, step_count });
        }

        // Build id → (name, agent_id, depends_on) map.
        let mut step_map: HashMap<String, (String, String, Vec<String>)> = HashMap::new();
        let mut valid_step_ids: HashSet<String> = HashSet::new();

        for row in &step_rows {
            let id: String = row.get("id");
            let name: String = row.get("name");
            let agent_id: String = row.get("agent_id");
            let depends_on: Option<String> = row.get("depends_on");
            let deps: Vec<String> = depends_on
                .as_deref()
                .filter(|s| !s.is_empty())
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default();

            valid_step_ids.insert(id.clone());
            step_map.insert(id, (name, agent_id, deps));
        }

        // ── 3. Validate agent_ids ──────────────────────────────────────────
        // Collect unique agent_ids and check in one query.
        let unique_agents: Vec<String> = step_map
            .values()
            .map(|(_, agent_id, _)| agent_id.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();

        for agent_id in &unique_agents {
            let exists = sqlx::query("SELECT 1 FROM agents WHERE id = ?1")
                .bind(agent_id)
                .fetch_optional(self.pool.as_ref())
                .await?;
            if exists.is_none() {
                errors.push(format!("agent '{agent_id}' referenced by a step does not exist"));
            }
        }

        // ── 4. Validate depends_on references ─────────────────────────────
        for (step_id, (step_name, _, deps)) in &step_map {
            for dep_id in deps {
                if !valid_step_ids.contains(dep_id) {
                    errors.push(format!(
                        "step '{step_name}' ({step_id}) depends_on unknown step id '{dep_id}'"
                    ));
                }
            }
        }

        // ── 5. Cycle detection via Kahn's topological sort ─────────────────
        // Build in-degree map.
        let mut in_degree: HashMap<String, usize> = step_map
            .keys()
            .map(|id| (id.clone(), 0))
            .collect();
        let mut adj: HashMap<String, Vec<String>> = HashMap::new();

        for (step_id, (_, _, deps)) in &step_map {
            for dep_id in deps {
                if valid_step_ids.contains(dep_id) {
                    adj.entry(dep_id.clone())
                        .or_default()
                        .push(step_id.clone());
                    *in_degree.entry(step_id.clone()).or_insert(0) += 1;
                }
            }
        }

        let mut queue: VecDeque<String> = in_degree
            .iter()
            .filter(|(_, &deg)| deg == 0)
            .map(|(id, _)| id.clone())
            .collect();

        let mut visited = 0usize;
        while let Some(node) = queue.pop_front() {
            visited += 1;
            if let Some(neighbours) = adj.get(&node) {
                for nbr in neighbours {
                    let deg = in_degree.entry(nbr.clone()).or_insert(0);
                    *deg -= 1;
                    if *deg == 0 {
                        queue.push_back(nbr.clone());
                    }
                }
            }
        }

        if visited < step_count {
            errors.push(format!(
                "circular dependency detected — {}/{} steps are part of a cycle",
                step_count - visited, step_count
            ));
        }

        Ok(DryRunReport {
            valid: errors.is_empty(),
            errors,
            step_count,
        })
    }
}
```

### 6.6 — Engine `start_workflow_run()` update in `engine_workflows.rs`

```rust
/// Start or dry-run a workflow.
///
/// When `dry_run = true`: validates the workflow DAG and returns a `DryRunReport`
/// without creating any runs or executing steps.  
/// When `dry_run = false`: behaves exactly as before.
pub async fn start_workflow_run(
    &self,
    workflow_id: &str,
    triggered_by: &str,
    run_input: &str,
    dry_run: bool,
) -> Result<serde_json::Value> {
    if dry_run {
        let report = self.workflow_manager.validate_workflow_dag(workflow_id).await?;
        return Ok(serde_json::to_value(report)
            .map_err(|e| rushdino_common::AppError::Internal(e.to_string()))?);
    }

    let workflow = self.workflow_manager.get_workflow(workflow_id).await?;
    let run = self
        .workflow_manager
        .create_run(workflow_id, triggered_by, run_input)
        .await?;
    self.runtime
        .register_workflow_run(
            &run.run_id,
            workflow_id,
            &workflow.name,
            Some(run_input),
            &self.provider_name,
            self.provider.model(),
        )
        .await?;
    self.workflow_runner.spawn_run(run.run_id.clone());

    Ok(serde_json::to_value(run)
        .map_err(|e| rushdino_common::AppError::Internal(e.to_string()))?)
}
```

**Note:** Changing the return type from `Result<WorkflowRunStartResponse>` to `Result<serde_json::Value>` is the simplest approach to unify both response shapes. Alternatively, define an enum response type — but the `serde_json::Value` approach minimizes type changes across callers.

### 6.7 — Route handler update in `routes/workflows.rs`

Update `StartWorkflowRunRequest` and `start_workflow_run`:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartWorkflowRunRequest {
    pub input: Option<String>,
    pub triggered_by: Option<String>,
    #[serde(default)]
    pub dry_run: bool,   // NEW
}

pub async fn start_workflow_run(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<StartWorkflowRunRequest>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let response = engine
        .start_workflow_run(
            &id,
            payload.triggered_by.as_deref().unwrap_or("user"),
            payload.input.as_deref().unwrap_or(""),
            payload.dry_run,
        )
        .await?;
    Ok(Json(response))
}
```

---

## Error Handling Notes

- `AppError::Forbidden` and `AppError::Unauthorized` may need to be added to `rushdino_common::AppError` if they don't already exist. Check `crates/common/src/lib.rs` — if only `NotFound`, `Validation`, `Internal` exist, add:
  ```rust
  Forbidden(String),
  Unauthorized(String),
  ```
  And map them to HTTP 403 / 401 in the `IntoResponse` impl for `AppError`.

- The `agents` table is referenced in dry-run validation. Verify the table name matches the schema in `001_init.sql` — search for `CREATE TABLE.*agents` to confirm.

---

## Testing Checklist

Before marking each task complete, verify:

- [ ] `cargo build -p rushdino-agent` compiles without warnings
- [ ] `cargo build -p rushdino-server` compiles without warnings
- [ ] `cargo test -p rushdino-agent` passes
- [ ] `cargo test -p rushdino-common` passes (migration applies)
- [ ] Manual smoke test: create workflow → update → GET `/versions` → returns 1 item
- [ ] Manual smoke test: POST `/run` with `dry_run: true` → no DB row created
- [ ] Manual smoke test: POST `/trigger` with `webhook_enabled = true` → run created

---

## Dependency Additions (if needed)

Check `crates/agent/Cargo.toml` and workspace `Cargo.toml` before adding:

| Crate | Version | Purpose |
|-------|---------|---------|
| `hmac` | `0.12` | HMAC-SHA256 for webhook signatures |
| `sha2` | `0.10` | SHA-256 hasher used with hmac |
| `regex` | `1` | Already present — no change needed |

Add to `crates/agent/Cargo.toml` `[dependencies]` only the missing ones.
