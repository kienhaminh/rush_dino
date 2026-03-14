use std::sync::Arc;

use chrono::{DateTime, Datelike, Duration, Timelike, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use rushdino_common::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CronJobState {
    Active,
    Paused,
    Running,
    Error,
}

impl CronJobState {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Paused => "paused",
            Self::Running => "running",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CronScheduleInput {
    Every { interval_seconds: i64 },
    At { run_at: String },
    Cron { expr: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CronTargetInput {
    AgentTurn {
        message: String,
        conversation_id: Option<String>,
        title: Option<String>,
        agent_id: Option<String>,
    },
    WorkflowRun {
        workflow_id: String,
        input: Option<String>,
        triggered_by: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCronJobInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub schedule: CronScheduleInput,
    pub target: CronTargetInput,
    pub enabled: Option<bool>,
    pub timezone: Option<String>,
    pub reentrant: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCronJobInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub schedule: Option<CronScheduleInput>,
    pub target: Option<CronTargetInput>,
    pub enabled: Option<bool>,
    pub timezone: Option<String>,
    pub reentrant: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CronJobRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub schedule: CronScheduleInput,
    pub timezone: Option<String>,
    pub target: CronTargetInput,
    pub enabled: bool,
    pub reentrant: bool,
    pub state: CronJobState,
    pub last_run_at: Option<String>,
    pub next_run_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CronRunStatus {
    Ok,
    Error,
    Blocked,
}

impl CronRunStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::Error => "error",
            Self::Blocked => "blocked",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CronRunRecord {
    pub id: String,
    pub job_id: String,
    pub status: CronRunStatus,
    pub trigger_kind: String,
    pub summary: Option<String>,
    pub error: Option<String>,
    pub session_id: Option<String>,
    pub workflow_run_id: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub created_at: String,
}

#[derive(Clone)]
pub struct CronManager {
    pool: Arc<SqlitePool>,
}

impl CronManager {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }

    pub async fn list_jobs(&self) -> Result<Vec<CronJobRecord>> {

        let rows = sqlx::query(
            r#"
            SELECT id, name, description, schedule_kind, schedule_payload, timezone, target_kind, target_payload,
                   enabled, reentrant, state, last_run_at, next_run_at, last_error, created_at, updated_at
            FROM cron_jobs
            ORDER BY updated_at DESC
            "#,
        )
        .fetch_all(self.pool.as_ref())
        .await?;
        rows.into_iter().map(map_cron_job).collect()
    }

    pub async fn get_job(&self, id: &str) -> Result<CronJobRecord> {

        let row = sqlx::query(
            r#"
            SELECT id, name, description, schedule_kind, schedule_payload, timezone, target_kind, target_payload,
                   enabled, reentrant, state, last_run_at, next_run_at, last_error, created_at, updated_at
            FROM cron_jobs
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(self.pool.as_ref())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("cron job {id} not found")))?;
        map_cron_job(row)
    }

    pub async fn create_job(&self, input: CreateCronJobInput) -> Result<CronJobRecord> {

        validate_job_name(&input.name)?;
        validate_schedule(&input.schedule)?;
        validate_target(&input.target)?;

        let now = Utc::now();
        let id = Uuid::new_v4().to_string();
        let next_run_at = compute_next_run_at(&input.schedule, input.timezone.as_deref(), now)?;
        let state = if input.enabled.unwrap_or(true) {
            CronJobState::Active
        } else {
            CronJobState::Paused
        };

        sqlx::query(
            r#"
            INSERT INTO cron_jobs (
                id, name, description, schedule_kind, schedule_payload, timezone, target_kind, target_payload,
                enabled, reentrant, state, last_run_at, next_run_at, last_error, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, ?12, NULL, ?13, ?14)
            "#,
        )
        .bind(&id)
        .bind(input.name.trim())
        .bind(input.description.trim())
        .bind(schedule_kind(&input.schedule))
        .bind(serde_json::to_string(&input.schedule).map_err(json_err)?)
        .bind(input.timezone.as_deref())
        .bind(target_kind(&input.target))
        .bind(serde_json::to_string(&input.target).map_err(json_err)?)
        .bind(i64::from(input.enabled.unwrap_or(true)))
        .bind(i64::from(input.reentrant.unwrap_or(false)))
        .bind(state.as_str())
        .bind(next_run_at.as_ref().map(DateTime::<Utc>::to_rfc3339))
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .execute(self.pool.as_ref())
        .await?;

        self.get_job(&id).await
    }

    pub async fn update_job(&self, id: &str, input: UpdateCronJobInput) -> Result<CronJobRecord> {

        let existing = self.get_job(id).await?;
        let schedule = input.schedule.unwrap_or(existing.schedule.clone());
        let target = input.target.unwrap_or(existing.target.clone());
        let name = input.name.unwrap_or(existing.name.clone());
        let description = input.description.unwrap_or(existing.description.clone());
        let enabled = input.enabled.unwrap_or(existing.enabled);
        let timezone = input.timezone.or(existing.timezone.clone());
        let reentrant = input.reentrant.unwrap_or(existing.reentrant);

        validate_job_name(&name)?;
        validate_schedule(&schedule)?;
        validate_target(&target)?;

        let now = Utc::now();
        let next_run_at = if enabled {
            compute_next_run_at(&schedule, timezone.as_deref(), now)?
        } else {
            None
        };
        let state = if enabled {
            CronJobState::Active
        } else {
            CronJobState::Paused
        };

        sqlx::query(
            r#"
            UPDATE cron_jobs
            SET name = ?1, description = ?2, schedule_kind = ?3, schedule_payload = ?4, timezone = ?5,
                target_kind = ?6, target_payload = ?7, enabled = ?8, reentrant = ?9,
                state = ?10, next_run_at = ?11, updated_at = ?12
            WHERE id = ?13
            "#,
        )
        .bind(name.trim())
        .bind(description.trim())
        .bind(schedule_kind(&schedule))
        .bind(serde_json::to_string(&schedule).map_err(json_err)?)
        .bind(timezone.as_deref())
        .bind(target_kind(&target))
        .bind(serde_json::to_string(&target).map_err(json_err)?)
        .bind(i64::from(enabled))
        .bind(i64::from(reentrant))
        .bind(state.as_str())
        .bind(next_run_at.as_ref().map(DateTime::<Utc>::to_rfc3339))
        .bind(now.to_rfc3339())
        .bind(id)
        .execute(self.pool.as_ref())
        .await?;

        self.get_job(id).await
    }

    pub async fn delete_job(&self, id: &str) -> Result<()> {

        let result = sqlx::query("DELETE FROM cron_jobs WHERE id = ?1")
            .bind(id)
            .execute(self.pool.as_ref())
            .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("cron job {id} not found")));
        }
        Ok(())
    }

    pub async fn pause_job(&self, id: &str) -> Result<CronJobRecord> {
        self.set_enabled_state(id, false).await
    }

    pub async fn resume_job(&self, id: &str) -> Result<CronJobRecord> {
        self.set_enabled_state(id, true).await
    }

    async fn set_enabled_state(&self, id: &str, enabled: bool) -> Result<CronJobRecord> {
        let job = self.get_job(id).await?;
        let next_run_at = if enabled {
            compute_next_run_at(&job.schedule, job.timezone.as_deref(), Utc::now())?
        } else {
            None
        };
        let state = if enabled {
            CronJobState::Active
        } else {
            CronJobState::Paused
        };
        sqlx::query(
            "UPDATE cron_jobs SET enabled = ?1, state = ?2, next_run_at = ?3, updated_at = ?4 WHERE id = ?5",
        )
        .bind(i64::from(enabled))
        .bind(state.as_str())
        .bind(next_run_at.as_ref().map(DateTime::<Utc>::to_rfc3339))
        .bind(Utc::now().to_rfc3339())
        .bind(id)
        .execute(self.pool.as_ref())
        .await?;
        self.get_job(id).await
    }

    pub async fn claim_due_jobs(&self, limit: i64, now: DateTime<Utc>) -> Result<Vec<CronJobRecord>> {

        let rows = sqlx::query(
            r#"
            SELECT id, name, description, schedule_kind, schedule_payload, timezone, target_kind, target_payload,
                   enabled, reentrant, state, last_run_at, next_run_at, last_error, created_at, updated_at
            FROM cron_jobs
            WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?1 AND state != 'running'
            ORDER BY next_run_at ASC
            LIMIT ?2
            "#,
        )
        .bind(now.to_rfc3339())
        .bind(limit)
        .fetch_all(self.pool.as_ref())
        .await?;

        let mut claimed = Vec::new();
        for row in rows {
            let job = map_cron_job(row)?;
            let result = sqlx::query(
                "UPDATE cron_jobs SET state = 'running', updated_at = ?1 WHERE id = ?2 AND state != 'running'",
            )
            .bind(now.to_rfc3339())
            .bind(&job.id)
            .execute(self.pool.as_ref())
            .await?;
            if result.rows_affected() == 1 {
                claimed.push(self.get_job(&job.id).await?);
            }
        }
        Ok(claimed)
    }

    pub async fn begin_run(&self, job_id: &str, trigger_kind: &str, now: DateTime<Utc>) -> Result<String> {

        let run_id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO cron_job_runs (id, job_id, status, trigger_kind, summary, error, session_id, workflow_run_id, started_at, completed_at, created_at)
            VALUES (?1, ?2, 'ok', ?3, NULL, NULL, NULL, NULL, ?4, NULL, ?5)
            "#,
        )
        .bind(&run_id)
        .bind(job_id)
        .bind(trigger_kind)
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .execute(self.pool.as_ref())
        .await?;
        Ok(run_id)
    }

    pub async fn complete_run(
        &self,
        job_id: &str,
        run_id: &str,
        status: CronRunStatus,
        summary: Option<&str>,
        error: Option<&str>,
        session_id: Option<&str>,
        workflow_run_id: Option<&str>,
        now: DateTime<Utc>,
    ) -> Result<CronJobRecord> {

        let job = self.get_job(job_id).await?;
        let next_run_at = if job.enabled {
            compute_next_run_after(&job.schedule, job.timezone.as_deref(), now)?
        } else {
            None
        };
        let job_state = match status {
            CronRunStatus::Ok => {
                if job.enabled {
                    CronJobState::Active
                } else {
                    CronJobState::Paused
                }
            }
            CronRunStatus::Error | CronRunStatus::Blocked => CronJobState::Error,
        };

        let mut tx = self.pool.begin().await?;
        sqlx::query(
            r#"
            UPDATE cron_job_runs
            SET status = ?1, summary = ?2, error = ?3, session_id = ?4, workflow_run_id = ?5, completed_at = ?6
            WHERE id = ?7
            "#,
        )
        .bind(status.as_str())
        .bind(summary)
        .bind(error)
        .bind(session_id)
        .bind(workflow_run_id)
        .bind(now.to_rfc3339())
        .bind(run_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            UPDATE cron_jobs
            SET state = ?1, last_run_at = ?2, next_run_at = ?3, last_error = ?4, updated_at = ?5
            WHERE id = ?6
            "#,
        )
        .bind(job_state.as_str())
        .bind(now.to_rfc3339())
        .bind(next_run_at.as_ref().map(DateTime::<Utc>::to_rfc3339))
        .bind(error)
        .bind(now.to_rfc3339())
        .bind(job_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        self.get_job(job_id).await
    }

    pub async fn list_runs(&self, job_id: &str, limit: i64) -> Result<Vec<CronRunRecord>> {

        let rows = sqlx::query(
            r#"
            SELECT id, job_id, status, trigger_kind, summary, error, session_id, workflow_run_id, started_at, completed_at, created_at
            FROM cron_job_runs
            WHERE job_id = ?1
            ORDER BY started_at DESC
            LIMIT ?2
            "#,
        )
        .bind(job_id)
        .bind(limit)
        .fetch_all(self.pool.as_ref())
        .await?;
        rows.into_iter().map(map_cron_run).collect()
    }
}

fn schedule_kind(schedule: &CronScheduleInput) -> &'static str {
    match schedule {
        CronScheduleInput::Every { .. } => "every",
        CronScheduleInput::At { .. } => "at",
        CronScheduleInput::Cron { .. } => "cron",
    }
}

fn target_kind(target: &CronTargetInput) -> &'static str {
    match target {
        CronTargetInput::AgentTurn { .. } => "agent_turn",
        CronTargetInput::WorkflowRun { .. } => "workflow_run",
    }
}

fn validate_job_name(name: &str) -> Result<()> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("cron job name is required".to_owned()));
    }
    Ok(())
}

fn validate_schedule(schedule: &CronScheduleInput) -> Result<()> {
    match schedule {
        CronScheduleInput::Every { interval_seconds } => {
            if *interval_seconds <= 0 {
                return Err(AppError::Validation(
                    "every schedule requires interval_seconds > 0".to_owned(),
                ));
            }
            Ok(())
        }
        CronScheduleInput::At { run_at } => {
            parse_rfc3339(run_at)?;
            Ok(())
        }
        CronScheduleInput::Cron { expr } => {
            parse_cron_expression(expr)?;
            Ok(())
        }
    }
}

fn validate_target(target: &CronTargetInput) -> Result<()> {
    match target {
        CronTargetInput::AgentTurn { message, .. } => {
            if message.trim().is_empty() {
                return Err(AppError::Validation(
                    "agent turn target requires a message".to_owned(),
                ));
            }
        }
        CronTargetInput::WorkflowRun { workflow_id, .. } => {
            if workflow_id.trim().is_empty() {
                return Err(AppError::Validation(
                    "workflow run target requires workflow_id".to_owned(),
                ));
            }
        }
    }
    Ok(())
}

fn compute_next_run_at(
    schedule: &CronScheduleInput,
    _timezone: Option<&str>,
    now: DateTime<Utc>,
) -> Result<Option<DateTime<Utc>>> {
    match schedule {
        CronScheduleInput::Every { interval_seconds } => Ok(Some(now + Duration::seconds(*interval_seconds))),
        CronScheduleInput::At { run_at } => {
            let at = parse_rfc3339(run_at)?;
            Ok((at > now).then_some(at))
        }
        CronScheduleInput::Cron { expr } => next_cron_occurrence(expr, now).map(Some),
    }
}

fn compute_next_run_after(
    schedule: &CronScheduleInput,
    timezone: Option<&str>,
    after: DateTime<Utc>,
) -> Result<Option<DateTime<Utc>>> {
    compute_next_run_at(schedule, timezone, after)
}

fn map_cron_job(row: sqlx::sqlite::SqliteRow) -> Result<CronJobRecord> {
    let schedule_payload = row.get::<String, _>("schedule_payload");
    let target_payload = row.get::<String, _>("target_payload");
    Ok(CronJobRecord {
        id: row.get("id"),
        name: row.get("name"),
        description: row.get("description"),
        schedule: serde_json::from_str(&schedule_payload).map_err(json_err)?,
        timezone: row.get("timezone"),
        target: serde_json::from_str(&target_payload).map_err(json_err)?,
        enabled: row.get::<i64, _>("enabled") != 0,
        reentrant: row.get::<i64, _>("reentrant") != 0,
        state: parse_state(&row.get::<String, _>("state"))?,
        last_run_at: row.get("last_run_at"),
        next_run_at: row.get("next_run_at"),
        last_error: row.get("last_error"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

fn map_cron_run(row: sqlx::sqlite::SqliteRow) -> Result<CronRunRecord> {
    Ok(CronRunRecord {
        id: row.get("id"),
        job_id: row.get("job_id"),
        status: parse_run_status(&row.get::<String, _>("status"))?,
        trigger_kind: row.get("trigger_kind"),
        summary: row.get("summary"),
        error: row.get("error"),
        session_id: row.get("session_id"),
        workflow_run_id: row.get("workflow_run_id"),
        started_at: row.get("started_at"),
        completed_at: row.get("completed_at"),
        created_at: row.get("created_at"),
    })
}

fn parse_state(value: &str) -> Result<CronJobState> {
    match value {
        "active" => Ok(CronJobState::Active),
        "paused" => Ok(CronJobState::Paused),
        "running" => Ok(CronJobState::Running),
        "error" => Ok(CronJobState::Error),
        _ => Err(AppError::Validation(format!("invalid cron state: {value}"))),
    }
}

fn parse_run_status(value: &str) -> Result<CronRunStatus> {
    match value {
        "ok" => Ok(CronRunStatus::Ok),
        "error" => Ok(CronRunStatus::Error),
        "blocked" => Ok(CronRunStatus::Blocked),
        _ => Err(AppError::Validation(format!("invalid cron run status: {value}"))),
    }
}

fn parse_rfc3339(value: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| AppError::Validation(format!("invalid timestamp {value}: {e}")))
}

fn json_err(error: serde_json::Error) -> AppError {
    AppError::Validation(format!("invalid json payload: {error}"))
}

#[derive(Debug)]
struct ParsedCron {
    minute: CronField,
    hour: CronField,
    day_of_month: CronField,
    month: CronField,
    day_of_week: CronField,
}

#[derive(Debug)]
enum CronField {
    Any,
    Step(u32),
    Exact(u32),
}

fn parse_cron_expression(expr: &str) -> Result<ParsedCron> {
    let parts = expr.split_whitespace().collect::<Vec<_>>();
    if parts.len() != 5 {
        return Err(AppError::Validation(
            "cron schedule requires 5 fields".to_owned(),
        ));
    }
    Ok(ParsedCron {
        minute: parse_field(parts[0], 0, 59)?,
        hour: parse_field(parts[1], 0, 23)?,
        day_of_month: parse_field(parts[2], 1, 31)?,
        month: parse_field(parts[3], 1, 12)?,
        day_of_week: parse_field(parts[4], 0, 6)?,
    })
}

fn parse_field(raw: &str, min: u32, max: u32) -> Result<CronField> {
    if raw == "*" {
        return Ok(CronField::Any);
    }
    if let Some(step) = raw.strip_prefix("*/") {
        let value = step
            .parse::<u32>()
            .map_err(|_| AppError::Validation(format!("invalid cron step: {raw}")))?;
        if value == 0 {
            return Err(AppError::Validation(format!("invalid cron step: {raw}")));
        }
        return Ok(CronField::Step(value));
    }
    let value = raw
        .parse::<u32>()
        .map_err(|_| AppError::Validation(format!("invalid cron field: {raw}")))?;
    if value < min || value > max {
        return Err(AppError::Validation(format!(
            "cron field out of range: {raw}"
        )));
    }
    Ok(CronField::Exact(value))
}

fn next_cron_occurrence(expr: &str, now: DateTime<Utc>) -> Result<DateTime<Utc>> {
    let parsed = parse_cron_expression(expr)?;
    let mut cursor = now + Duration::minutes(1);
    cursor = cursor
        .with_second(0)
        .and_then(|dt| dt.with_nanosecond(0))
        .ok_or_else(|| AppError::Validation("unable to align cron cursor".to_owned()))?;

    for _ in 0..(366 * 24 * 60) {
        if cron_matches(&parsed, cursor) {
            return Ok(cursor);
        }
        cursor += Duration::minutes(1);
    }

    Err(AppError::Validation(
        "could not compute next cron occurrence".to_owned(),
    ))
}

fn cron_matches(parsed: &ParsedCron, dt: DateTime<Utc>) -> bool {
    field_matches(&parsed.minute, dt.minute())
        && field_matches(&parsed.hour, dt.hour())
        && field_matches(&parsed.day_of_month, dt.day())
        && field_matches(&parsed.month, dt.month())
        && field_matches(
            &parsed.day_of_week,
            dt.weekday().num_days_from_sunday(),
        )
}

fn field_matches(field: &CronField, value: u32) -> bool {
    match field {
        CronField::Any => true,
        CronField::Step(step) => value % step == 0,
        CronField::Exact(exact) => value == *exact,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_manager() -> CronManager {
        let pool = SqlitePool::connect(":memory:").await.expect("memory db");
        for statement in include_str!("../../common/migrations/001_init.sql").split(';') {
            let sql = statement.trim();
            if sql.is_empty() {
                continue;
            }
            sqlx::query(sql)
                .execute(&pool)
                .await
                .expect("run init migration");
        }
        CronManager::new(Arc::new(pool))
    }

    #[tokio::test]
    async fn creates_lists_and_pauses_job() {
        let manager = setup_manager().await;
        let job = manager
            .create_job(CreateCronJobInput {
                name: "nightly".to_owned(),
                description: "nightly summary".to_owned(),
                schedule: CronScheduleInput::Every {
                    interval_seconds: 300,
                },
                target: CronTargetInput::AgentTurn {
                    message: "Summarize the workspace".to_owned(),
                    conversation_id: None,
                    title: None,
                    agent_id: None,
                },
                enabled: Some(true),
                timezone: None,
                reentrant: Some(false),
            })
            .await
            .expect("create job");

        assert_eq!(manager.list_jobs().await.expect("list").len(), 1);
        let paused = manager.pause_job(&job.id).await.expect("pause");
        assert_eq!(paused.state, CronJobState::Paused);
        assert!(paused.next_run_at.is_none());
    }

    #[test]
    fn rejects_invalid_cron_expression() {
        let err = validate_schedule(&CronScheduleInput::Cron {
            expr: "invalid".to_owned(),
        })
        .expect_err("invalid cron should fail");
        assert!(err.to_string().contains("5 fields"));
    }

    #[test]
    fn computes_next_simple_cron_occurrence() {
        let now = DateTime::parse_from_rfc3339("2026-03-13T10:02:00Z")
            .expect("parse now")
            .with_timezone(&Utc);
        let next = next_cron_occurrence("*/5 * * * *", now).expect("next cron");
        assert_eq!(next.to_rfc3339(), "2026-03-13T10:05:00+00:00");
    }
}
