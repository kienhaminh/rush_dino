use std::sync::Arc;

use chrono::Utc;
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use rushdino_common::Result;

use crate::runtime::types::{
    RunDetail, RunEventRecord, RunKind, RunListFilter, RunOriginMetadata, RunPolicySnapshot,
    RunSnapshot, RunState,
};

#[derive(Debug, Clone)]
pub struct NewRunRecord {
    pub id: String,
    pub kind: RunKind,
    pub state: RunState,
    pub origin: RunOriginMetadata,
    pub session_id: Option<String>,
    pub conversation_id: Option<String>,
    pub workflow_id: Option<String>,
    pub title: String,
    pub input_text: Option<String>,
    pub provider: String,
    pub model: String,
    pub fallback_profile_id: Option<String>,
    pub queue_position: Option<i64>,
    pub policy: RunPolicySnapshot,
}

#[derive(Debug, Clone, Default)]
pub enum FieldUpdate<T> {
    #[default]
    Keep,
    Set(T),
    Clear,
}

#[derive(Debug, Clone, Default)]
pub struct RunPatch {
    pub state: Option<RunState>,
    pub output_text: FieldUpdate<String>,
    pub queue_position: FieldUpdate<i64>,
    pub active_tool: FieldUpdate<String>,
    pub policy: Option<RunPolicySnapshot>,
    pub error: FieldUpdate<String>,
    pub abort_requested: Option<bool>,
    pub set_started_at: bool,
    pub set_completed_at: bool,
    pub event_type: Option<String>,
    pub event_message: Option<String>,
    pub event_tool_name: Option<String>,
}

pub struct RunStore {
    pool: Arc<SqlitePool>,
}

impl RunStore {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }

    pub async fn reconcile_incomplete_runs(&self) -> Result<()> {
        let stale = self
            .list_runs(RunListFilter {
                limit: 500,
                ..RunListFilter::default()
            })
            .await?
            .into_iter()
            .filter(|run| !run.state.is_terminal())
            .collect::<Vec<_>>();

        for run in stale {
            let policy = RunPolicySnapshot {
                reason: Some("server restarted before the run reached a terminal state".to_owned()),
                ..run.policy.clone()
            };
            self.patch_run(
                &run.id,
                RunPatch {
                    state: Some(RunState::Failed),
                    error: FieldUpdate::Set(
                        "server restarted before the run reached a terminal state".to_owned(),
                    ),
                    policy: Some(policy),
                    set_completed_at: true,
                    event_type: Some("reconciled_after_restart".to_owned()),
                    event_message: Some(
                        "Run was marked failed after server restart to clear stale state."
                            .to_owned(),
                    ),
                    ..RunPatch::default()
                },
            )
            .await?;
        }

        Ok(())
    }

    pub async fn insert_run(&self, new_run: NewRunRecord) -> Result<RunSnapshot> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            INSERT INTO runtime_runs (
              id, kind, state, source, channel_id, sender_id, gateway_session_id,
              session_id, conversation_id, workflow_id, title, input_text,
              output_text, provider, model, fallback_profile_id, queue_position, active_tool,
              policy_decision, approval_state, sandbox_state, effective_scope, reason, error,
              abort_requested, created_at, started_at, completed_at, updated_at
            ) VALUES (
              ?1, ?2, ?3, ?4, ?5, ?6, ?7,
              ?8, ?9, ?10, ?11, ?12,
              NULL, ?13, ?14, ?15, ?16, NULL,
              ?17, ?18, ?19, ?20, ?21, NULL,
              0, ?22, NULL, NULL, ?22
            )
            "#,
        )
        .bind(&new_run.id)
        .bind(new_run.kind.as_str())
        .bind(new_run.state.as_str())
        .bind(&new_run.origin.source)
        .bind(&new_run.origin.channel_id)
        .bind(&new_run.origin.sender_id)
        .bind(&new_run.origin.gateway_session_id)
        .bind(&new_run.session_id)
        .bind(&new_run.conversation_id)
        .bind(&new_run.workflow_id)
        .bind(&new_run.title)
        .bind(&new_run.input_text)
        .bind(&new_run.provider)
        .bind(&new_run.model)
        .bind(&new_run.fallback_profile_id)
        .bind(new_run.queue_position)
        .bind(&new_run.policy.decision)
        .bind(&new_run.policy.approval_state)
        .bind(&new_run.policy.sandbox_state)
        .bind(&new_run.policy.effective_scope)
        .bind(&new_run.policy.reason)
        .bind(&now)
        .execute(self.pool.as_ref())
        .await?;

        self.insert_event(
            &new_run.id,
            "queued",
            Some(new_run.state),
            None,
            Some("Run registered in the runtime queue.".to_owned()),
            &new_run.policy,
        )
        .await?;

        self.get_run(&new_run.id).await
    }

    pub async fn get_run(&self, run_id: &str) -> Result<RunSnapshot> {
        let row = sqlx::query(
            r#"
            SELECT
              id, kind, state, source, channel_id, sender_id, gateway_session_id,
              session_id, conversation_id, workflow_id, title, input_text,
              output_text, provider, model, fallback_profile_id, queue_position, active_tool,
              policy_decision, approval_state, sandbox_state, effective_scope, reason, error,
              abort_requested, created_at, started_at, completed_at, updated_at
            FROM runtime_runs
            WHERE id = ?1
            "#,
        )
        .bind(run_id)
        .fetch_one(self.pool.as_ref())
        .await?;

        map_run_row(row)
    }

    pub async fn list_runs(&self, filter: RunListFilter) -> Result<Vec<RunSnapshot>> {
        let rows = sqlx::query(
            r#"
            SELECT
              id, kind, state, source, channel_id, sender_id, gateway_session_id,
              session_id, conversation_id, workflow_id, title, input_text,
              output_text, provider, model, fallback_profile_id, queue_position, active_tool,
              policy_decision, approval_state, sandbox_state, effective_scope, reason, error,
              abort_requested, created_at, started_at, completed_at, updated_at
            FROM runtime_runs
            WHERE (?1 IS NULL OR kind = ?1)
              AND (?2 IS NULL OR state = ?2)
              AND (?3 IS NULL OR source = ?3)
              AND (?4 IS NULL OR channel_id = ?4)
              AND (?5 IS NULL OR gateway_session_id = ?5)
              AND (?6 IS NULL OR session_id = ?6)
              AND (?7 IS NULL OR conversation_id = ?7)
            ORDER BY created_at DESC
            LIMIT ?8
            "#,
        )
        .bind(filter.kind.map(|kind| kind.as_str()))
        .bind(filter.state.map(|state| state.as_str()))
        .bind(filter.source)
        .bind(filter.channel_id)
        .bind(filter.gateway_session_id)
        .bind(filter.session_id)
        .bind(filter.conversation_id)
        .bind(filter.limit.max(1))
        .fetch_all(self.pool.as_ref())
        .await?;

        rows.into_iter().map(map_run_row).collect()
    }

    pub async fn list_events(&self, run_id: &str, limit: i64) -> Result<Vec<RunEventRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT
              id, run_id, event_type, state, tool_name, message,
              policy_decision, approval_state, sandbox_state, effective_scope, reason, created_at
            FROM runtime_run_events
            WHERE run_id = ?1
            ORDER BY created_at DESC, id DESC
            LIMIT ?2
            "#,
        )
        .bind(run_id)
        .bind(limit.max(1))
        .fetch_all(self.pool.as_ref())
        .await?;

        rows.into_iter().map(map_event_row).collect()
    }

    pub async fn get_run_detail(&self, run_id: &str, event_limit: i64) -> Result<RunDetail> {
        let snapshot = self.get_run(run_id).await?;
        let events = self.list_events(run_id, event_limit).await?;
        Ok(RunDetail { snapshot, events })
    }

    pub async fn patch_run(&self, run_id: &str, patch: RunPatch) -> Result<RunSnapshot> {
        let mut current = self.get_run(run_id).await?;
        let now = Utc::now().to_rfc3339();

        if let Some(state) = patch.state {
            current.state = state;
        }
        match patch.output_text {
            FieldUpdate::Keep => {}
            FieldUpdate::Set(value) => current.output_text = Some(value),
            FieldUpdate::Clear => current.output_text = None,
        }
        match patch.queue_position {
            FieldUpdate::Keep => {}
            FieldUpdate::Set(value) => current.queue_position = Some(value),
            FieldUpdate::Clear => current.queue_position = None,
        }
        match patch.active_tool {
            FieldUpdate::Keep => {}
            FieldUpdate::Set(value) => current.active_tool = Some(value),
            FieldUpdate::Clear => current.active_tool = None,
        }
        match patch.error {
            FieldUpdate::Keep => {}
            FieldUpdate::Set(value) => current.error = Some(value),
            FieldUpdate::Clear => current.error = None,
        }
        if let Some(policy) = patch.policy {
            current.policy = policy;
        }
        if let Some(abort_requested) = patch.abort_requested {
            current.abort_requested = abort_requested;
        }
        if patch.set_started_at && current.started_at.is_none() {
            current.started_at = Some(now.clone());
        }
        if patch.set_completed_at {
            if current.started_at.is_none() {
                current.started_at = Some(now.clone());
            }
            current.completed_at = Some(now.clone());
        }
        current.updated_at = now;

        sqlx::query(
            r#"
            UPDATE runtime_runs
            SET
              state = ?2,
              output_text = ?3,
              queue_position = ?4,
              active_tool = ?5,
              policy_decision = ?6,
              approval_state = ?7,
              sandbox_state = ?8,
              effective_scope = ?9,
              reason = ?10,
              error = ?11,
              abort_requested = ?12,
              started_at = ?13,
              completed_at = ?14,
              updated_at = ?15
            WHERE id = ?1
            "#,
        )
        .bind(&current.id)
        .bind(current.state.as_str())
        .bind(&current.output_text)
        .bind(current.queue_position)
        .bind(&current.active_tool)
        .bind(&current.policy.decision)
        .bind(&current.policy.approval_state)
        .bind(&current.policy.sandbox_state)
        .bind(&current.policy.effective_scope)
        .bind(&current.policy.reason)
        .bind(&current.error)
        .bind(i64::from(current.abort_requested))
        .bind(&current.started_at)
        .bind(&current.completed_at)
        .bind(&current.updated_at)
        .execute(self.pool.as_ref())
        .await?;

        if let Some(event_type) = patch.event_type {
            self.insert_event(
                &current.id,
                &event_type,
                Some(current.state),
                patch.event_tool_name,
                patch.event_message,
                &current.policy,
            )
            .await?;
        }

        Ok(current)
    }

    async fn insert_event(
        &self,
        run_id: &str,
        event_type: &str,
        state: Option<RunState>,
        tool_name: Option<String>,
        message: Option<String>,
        policy: &RunPolicySnapshot,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO runtime_run_events (
              id, run_id, event_type, state, tool_name, message,
              policy_decision, approval_state, sandbox_state, effective_scope, reason, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(run_id)
        .bind(event_type)
        .bind(state.map(|value| value.as_str().to_owned()))
        .bind(tool_name)
        .bind(message)
        .bind(&policy.decision)
        .bind(&policy.approval_state)
        .bind(&policy.sandbox_state)
        .bind(&policy.effective_scope)
        .bind(&policy.reason)
        .bind(Utc::now().to_rfc3339())
        .execute(self.pool.as_ref())
        .await?;

        Ok(())
    }
}

fn map_run_row(row: sqlx::sqlite::SqliteRow) -> Result<RunSnapshot> {
    Ok(RunSnapshot {
        id: row.get("id"),
        kind: RunKind::parse(row.get::<String, _>("kind").as_str())?,
        state: RunState::parse(row.get::<String, _>("state").as_str())?,
        source: row.get("source"),
        channel_id: row.get("channel_id"),
        sender_id: row.get("sender_id"),
        gateway_session_id: row.get("gateway_session_id"),
        session_id: row.get("session_id"),
        conversation_id: row.get("conversation_id"),
        workflow_id: row.get("workflow_id"),
        title: row.get("title"),
        input_text: row.get("input_text"),
        output_text: row.get("output_text"),
        provider: row.get("provider"),
        model: row.get("model"),
        fallback_profile_id: row.get("fallback_profile_id"),
        queue_position: row.get("queue_position"),
        active_tool: row.get("active_tool"),
        abort_requested: row.get::<i64, _>("abort_requested") != 0,
        policy: RunPolicySnapshot {
            decision: row.get("policy_decision"),
            approval_state: row.get("approval_state"),
            sandbox_state: row.get("sandbox_state"),
            effective_scope: row.get("effective_scope"),
            reason: row.get("reason"),
        },
        error: row.get("error"),
        created_at: row.get("created_at"),
        started_at: row.get("started_at"),
        completed_at: row.get("completed_at"),
        updated_at: row.get("updated_at"),
    })
}

fn map_event_row(row: sqlx::sqlite::SqliteRow) -> Result<RunEventRecord> {
    Ok(RunEventRecord {
        id: row.get("id"),
        run_id: row.get("run_id"),
        event_type: row.get("event_type"),
        state: row
            .get::<Option<String>, _>("state")
            .map(|value| RunState::parse(&value))
            .transpose()?,
        tool_name: row.get("tool_name"),
        message: row.get("message"),
        policy: RunPolicySnapshot {
            decision: row.get("policy_decision"),
            approval_state: row.get("approval_state"),
            sandbox_state: row.get("sandbox_state"),
            effective_scope: row.get("effective_scope"),
            reason: row.get("reason"),
        },
        created_at: row.get("created_at"),
    })
}
