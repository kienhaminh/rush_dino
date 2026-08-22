//! Agent health tracking and circuit breaker for the matching engine.
//!
//! Records task outcomes (success/failure) per agent and exposes a circuit
//! breaker check: when an agent's recent failure rate exceeds a threshold,
//! the circuit "opens" and the matching engine skips that agent.

use std::sync::Arc;

use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

use rushdino_common::Result;

/// Number of most-recent outcomes evaluated by the circuit breaker.
const HEALTH_WINDOW: i64 = 10;

/// Failure rate (0.0--1.0) above which the circuit opens.
/// At 0.50 the agent is excluded after failing >= 50 % of its last
/// `HEALTH_WINDOW` tasks.
const CIRCUIT_OPEN_THRESHOLD: f64 = 0.50;

/// Persistent store for agent health events and match outcomes.
///
/// Used by [`crate::kanban_matching_engine`] to adjust scores and by
/// [`crate::kanban_dispatcher::KanbanDispatcher`] to record results.
pub struct AgentHealthStore {
    pool: Arc<SqlitePool>,
}

impl AgentHealthStore {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }

    /// Record a task outcome for both matching feedback and health tracking.
    pub async fn record_outcome(
        &self,
        agent_name: &str,
        task_id: &str,
        tags: &[String],
        succeeded: bool,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let tags_str = tags.join(",");
        let event_type = if succeeded { "success" } else { "failure" };

        // Insert into match outcomes.
        sqlx::query(
            "INSERT INTO agent_match_outcomes \
             (id, agent_name, task_id, tags, succeeded, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(agent_name)
        .bind(task_id)
        .bind(&tags_str)
        .bind(succeeded as i32)
        .bind(&now)
        .execute(self.pool.as_ref())
        .await?;

        // Insert into health events.
        sqlx::query(
            "INSERT INTO agent_health_events \
             (id, agent_name, event_type, task_id, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(agent_name)
        .bind(event_type)
        .bind(task_id)
        .bind(&now)
        .execute(self.pool.as_ref())
        .await?;

        Ok(())
    }

    /// Success rate over the last [`HEALTH_WINDOW`] tasks for an agent.
    ///
    /// Returns `1.0` (healthy) when no history exists.
    pub async fn get_success_rate(&self, agent_name: &str) -> Result<f64> {
        let row: (i64, i64) = sqlx::query_as(
            "SELECT COUNT(*) AS total, COALESCE(SUM(succeeded), 0) AS successes \
             FROM (SELECT succeeded FROM agent_match_outcomes \
                   WHERE agent_name = ?1 \
                   ORDER BY created_at DESC LIMIT ?2)",
        )
        .bind(agent_name)
        .bind(HEALTH_WINDOW)
        .fetch_one(self.pool.as_ref())
        .await?;

        let (total, successes) = row;
        if total == 0 {
            return Ok(1.0);
        }
        Ok(successes as f64 / total as f64)
    }

    /// Returns `true` when the agent should be excluded from matching.
    ///
    /// The circuit opens when the success rate drops below
    /// `1.0 - CIRCUIT_OPEN_THRESHOLD` (i.e. the failure rate exceeds the
    /// threshold).
    pub async fn is_circuit_open(&self, agent_name: &str) -> Result<bool> {
        let rate = self.get_success_rate(agent_name).await?;
        Ok(rate < (1.0 - CIRCUIT_OPEN_THRESHOLD))
    }

    /// Total number of recorded task outcomes for an agent across all time.
    pub async fn get_total_tasks(&self, agent_name: &str) -> Result<i64> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM agent_match_outcomes WHERE agent_name = ?1")
                .bind(agent_name)
                .fetch_one(self.pool.as_ref())
                .await?;
        Ok(row.0)
    }

    /// Delete all recorded outcomes and health events for an agent, resetting
    /// its health metrics to the initial "healthy" state.
    pub async fn reset(&self, agent_name: &str) -> Result<()> {
        sqlx::query("DELETE FROM agent_match_outcomes WHERE agent_name = ?1")
            .bind(agent_name)
            .execute(self.pool.as_ref())
            .await?;
        sqlx::query("DELETE FROM agent_health_events WHERE agent_name = ?1")
            .bind(agent_name)
            .execute(self.pool.as_ref())
            .await?;
        Ok(())
    }
}

#[cfg(test)]
#[path = "agent_health_store_tests.rs"]
mod tests;
