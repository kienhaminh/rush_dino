use std::{collections::HashMap, path::PathBuf, sync::Arc};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

use rushdino_common::{AppError, Result};

use crate::{
    agent_installer::{check_binary_in_path, install_with_progress},
    agent_registry::{known_agents, CodingAgentDescriptor},
    protocol::types::{AcpBroadcastEvent, AcpPromptRequest, AcpStdioEvent},
    session_store::{AcpSessionRecord, AcpSessionStatus},
    stdio_bridge::AcpStdioBridge,
};

/// Public summary of a known coding agent's availability on this machine.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    pub id: String,
    pub display_name: String,
    pub installed: bool,
    pub binary_name: String,
    pub install_command: String,
    pub slash_command: String,
}

struct ActiveSession {
    record: AcpSessionRecord,
    bridge: Option<Arc<AcpStdioBridge>>,
}

/// Central manager for ACP coding-agent sessions.
///
/// Holds an `Arc<CodingAgentManager>` in `AppState` and in the `AgentEngine`.
/// Thread-safe: all interior state is behind `RwLock`.
pub struct CodingAgentManager {
    pool: Arc<SqlitePool>,
    workspace_root: PathBuf,
    sessions: RwLock<HashMap<String, ActiveSession>>,
    event_tx: broadcast::Sender<AcpBroadcastEvent>,
}

impl CodingAgentManager {
    pub fn new(pool: Arc<SqlitePool>, workspace_root: PathBuf) -> Self {
        let (event_tx, _) = broadcast::channel(256);
        Self {
            pool,
            workspace_root,
            sessions: RwLock::new(HashMap::new()),
            event_tx,
        }
    }

    /// Subscribe to all ACP broadcast events (tokens, done, errors, install logs).
    pub fn subscribe_events(&self) -> broadcast::Receiver<AcpBroadcastEvent> {
        self.event_tx.subscribe()
    }

    /// Returns install status for all known coding agents.
    pub fn detect_installed(&self) -> Vec<AgentStatus> {
        known_agents()
            .iter()
            .map(|desc| AgentStatus {
                id: desc.id.to_owned(),
                display_name: desc.display_name.to_owned(),
                installed: check_binary_in_path(desc.binary_name),
                binary_name: desc.binary_name.to_owned(),
                install_command: desc.install_command.to_owned(),
                slash_command: desc.slash_command.to_owned(),
            })
            .collect()
    }

    /// Install an agent via its install command, streaming log lines as
    /// `AcpBroadcastEvent::InstallLog` events.
    pub async fn install_agent(&self, agent_id: &str) -> Result<()> {
        let desc = find_agent(agent_id)?;
        let (progress_tx, mut progress_rx) = tokio::sync::mpsc::channel::<String>(64);
        let event_tx = self.event_tx.clone();
        let agent_id_owned = agent_id.to_owned();

        tokio::spawn(async move {
            while let Some(line) = progress_rx.recv().await {
                let _ = event_tx.send(AcpBroadcastEvent::InstallLog {
                    agent_id: agent_id_owned.clone(),
                    line,
                });
            }
        });

        install_with_progress(desc, progress_tx).await
    }

    /// Spawn a new coding-agent process and create a session record.
    pub async fn spawn_session(
        &self,
        agent_id: &str,
        conversation_id: &str,
        working_dir: Option<PathBuf>,
    ) -> Result<AcpSessionRecord> {
        let desc = find_agent(agent_id)?;

        let session_id = Uuid::new_v4().to_string();
        let working_dir = working_dir
            .unwrap_or_else(|| self.workspace_root.join(&session_id));
        let working_dir_str = working_dir.to_string_lossy().to_string();

        tokio::fs::create_dir_all(&working_dir).await?;

        let record = AcpSessionRecord {
            id: session_id.clone(),
            agent_id: agent_id.to_owned(),
            conversation_id: conversation_id.to_owned(),
            rush_run_id: None,
            status: AcpSessionStatus::Active,
            working_dir: working_dir_str,
            started_at: Utc::now(),
            completed_at: None,
            error: None,
        };

        self.insert_session_record(&record).await?;

        let child = tokio::process::Command::new(desc.binary_name)
            .arg(desc.acp_flag)
            .current_dir(&working_dir)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| {
                AppError::Agent(format!(
                    "failed to spawn {} process: {e}",
                    desc.binary_name
                ))
            })?;

        let bridge = Arc::new(AcpStdioBridge::new(child)?);

        self.sessions.write().await.insert(
            session_id.clone(),
            ActiveSession {
                record: record.clone(),
                bridge: Some(bridge),
            },
        );

        Ok(record)
    }

    /// Send a prompt to an active session and collect the response.
    /// Emits `AcpBroadcastEvent::Token` events while streaming.
    pub async fn send_prompt(
        &self,
        acp_session_id: &str,
        text: &str,
        stream: bool,
    ) -> Result<String> {
        let (bridge, agent_id, conversation_id) = {
            let sessions = self.sessions.read().await;
            let s = sessions.get(acp_session_id).ok_or_else(|| {
                AppError::NotFound(format!("acp session not found: {acp_session_id}"))
            })?;
            (
                s.bridge.clone().ok_or_else(|| {
                    AppError::Agent(format!("acp session {acp_session_id} has no bridge"))
                })?,
                s.record.agent_id.clone(),
                s.record.conversation_id.clone(),
            )
        };

        bridge
            .send_request(&AcpPromptRequest {
                session_id: acp_session_id.to_owned(),
                text: text.to_owned(),
                stream,
            })
            .await?;

        let mut final_text = String::new();
        loop {
            match bridge.next_event().await? {
                None => {
                    // EOF without a Done event means the child crashed or closed
                    // its stdout unexpectedly — treat as error, not completion.
                    self.update_session_status(
                        acp_session_id,
                        AcpSessionStatus::Error,
                        Some("acp child process closed stdout unexpectedly".to_owned()),
                    )
                    .await?;
                    return Err(AppError::Agent(
                        "acp child process closed stdout unexpectedly".to_owned(),
                    ));
                }
                Some(AcpStdioEvent::Done { final_text: ft, .. }) => {
                    // Emit done event before breaking.
                    let _ = self.event_tx.send(AcpBroadcastEvent::Done {
                        session_id: acp_session_id.to_owned(),
                        run_id: String::new(),
                        conversation_id: conversation_id.clone(),
                        agent_id: agent_id.clone(),
                        final_text: ft.clone(),
                    });
                    final_text = ft;
                    break;
                }
                Some(AcpStdioEvent::Token { session_id, delta }) => {
                    let _ = self.event_tx.send(AcpBroadcastEvent::Token {
                        session_id: session_id.clone(),
                        run_id: String::new(),
                        conversation_id: conversation_id.clone(),
                        agent_id: agent_id.clone(),
                        delta: delta.clone(),
                    });
                    final_text.push_str(&delta);
                }
                Some(AcpStdioEvent::Error { message, session_id }) => {
                    let _ = self.event_tx.send(AcpBroadcastEvent::Error {
                        session_id: session_id.clone(),
                        agent_id: agent_id.clone(),
                        message: message.clone(),
                    });
                    self.update_session_status(
                        acp_session_id,
                        AcpSessionStatus::Error,
                        Some(message.clone()),
                    )
                    .await?;
                    return Err(AppError::Agent(format!("acp agent error: {message}")));
                }
                Some(AcpStdioEvent::ToolCall { .. }) => {
                    // Coding agent handles tool calls internally in ACP mode.
                }
            }
        }

        self.update_session_status(acp_session_id, AcpSessionStatus::Completed, None)
            .await?;

        Ok(final_text)
    }

    /// Mark a session as cancelled and kill the child process.
    pub async fn cancel_session(&self, session_id: &str) -> Result<()> {
        // Kill the child process so it stops emitting tokens after cancellation.
        if let Some(session) = self.sessions.read().await.get(session_id) {
            if let Some(bridge) = &session.bridge {
                bridge.kill().await;
            }
        }
        self.update_session_status(
            session_id,
            AcpSessionStatus::Error,
            Some("cancelled".to_owned()),
        )
        .await
    }

    /// Remove a session from memory and delete it from the database.
    pub async fn terminate_session(&self, session_id: &str) -> Result<()> {
        self.sessions.write().await.remove(session_id);
        sqlx::query("DELETE FROM acp_sessions WHERE id = ?")
            .bind(session_id)
            .execute(&*self.pool)
            .await?;
        Ok(())
    }

    /// List recent sessions (newest first, limit 100).
    pub async fn list_sessions(&self) -> Result<Vec<AcpSessionRecord>> {
        let rows = sqlx::query(
            r#"SELECT id, agent_id, conversation_id, rush_run_id, status, working_dir,
                      started_at, completed_at, error
               FROM acp_sessions ORDER BY started_at DESC LIMIT 100"#,
        )
        .fetch_all(&*self.pool)
        .await?;

        rows.into_iter().map(map_session_row).collect()
    }

    /// Fetch a single session by id.
    pub async fn get_session(&self, session_id: &str) -> Result<AcpSessionRecord> {
        let row = sqlx::query(
            r#"SELECT id, agent_id, conversation_id, rush_run_id, status, working_dir,
                      started_at, completed_at, error
               FROM acp_sessions WHERE id = ?"#,
        )
        .bind(session_id)
        .fetch_optional(&*self.pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("acp session not found: {session_id}")))?;

        map_session_row(row)
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    async fn insert_session_record(&self, record: &AcpSessionRecord) -> Result<()> {
        sqlx::query(
            r#"INSERT INTO acp_sessions
               (id, agent_id, conversation_id, rush_run_id, status, working_dir, started_at, completed_at, error)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&record.id)
        .bind(&record.agent_id)
        .bind(&record.conversation_id)
        .bind(&record.rush_run_id)
        .bind(record.status.to_string())
        .bind(&record.working_dir)
        .bind(record.started_at.to_rfc3339())
        .bind(record.completed_at.map(|t| t.to_rfc3339()))
        .bind(&record.error)
        .execute(&*self.pool)
        .await?;
        Ok(())
    }

    async fn update_session_status(
        &self,
        session_id: &str,
        status: AcpSessionStatus,
        error: Option<String>,
    ) -> Result<()> {
        let completed_at = if status != AcpSessionStatus::Active {
            Some(Utc::now().to_rfc3339())
        } else {
            None
        };
        sqlx::query(
            "UPDATE acp_sessions SET status = ?, completed_at = ?, error = ? WHERE id = ?",
        )
        .bind(status.to_string())
        .bind(&completed_at)
        .bind(&error)
        .bind(session_id)
        .execute(&*self.pool)
        .await?;

        // Mirror into in-memory map.
        if let Some(session) = self.sessions.write().await.get_mut(session_id) {
            session.record.status = status;
            session.record.error = error;
            if let Some(ts) = completed_at {
                session.record.completed_at = chrono::DateTime::parse_from_rfc3339(&ts)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc));
            }
        }
        Ok(())
    }
}

// -------------------------------------------------------------------------
// Database row mapper
// -------------------------------------------------------------------------

fn map_session_row(row: sqlx::sqlite::SqliteRow) -> Result<AcpSessionRecord> {
    let status_str: String = row
        .try_get("status")
        .map_err(|e| AppError::Db(Box::new(e)))?;
    let status = match status_str.as_str() {
        "active" => AcpSessionStatus::Active,
        "completed" => AcpSessionStatus::Completed,
        _ => AcpSessionStatus::Error,
    };

    let started_at_str: String = row
        .try_get("started_at")
        .map_err(|e| AppError::Db(Box::new(e)))?;
    let started_at = chrono::DateTime::parse_from_rfc3339(&started_at_str)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now());

    let completed_at_str: Option<String> = row
        .try_get("completed_at")
        .map_err(|e| AppError::Db(Box::new(e)))?;
    let completed_at = completed_at_str.and_then(|s| {
        chrono::DateTime::parse_from_rfc3339(&s)
            .ok()
            .map(|dt| dt.with_timezone(&Utc))
    });

    Ok(AcpSessionRecord {
        id: row.try_get("id").map_err(|e| AppError::Db(Box::new(e)))?,
        agent_id: row
            .try_get("agent_id")
            .map_err(|e| AppError::Db(Box::new(e)))?,
        conversation_id: row
            .try_get("conversation_id")
            .map_err(|e| AppError::Db(Box::new(e)))?,
        rush_run_id: row
            .try_get("rush_run_id")
            .map_err(|e| AppError::Db(Box::new(e)))?,
        status,
        working_dir: row
            .try_get("working_dir")
            .map_err(|e| AppError::Db(Box::new(e)))?,
        started_at,
        completed_at,
        error: row
            .try_get("error")
            .map_err(|e| AppError::Db(Box::new(e)))?,
    })
}

fn find_agent(agent_id: &str) -> Result<&'static CodingAgentDescriptor> {
    known_agents()
        .iter()
        .find(|d| d.id == agent_id)
        .ok_or_else(|| AppError::NotFound(format!("unknown coding agent: {agent_id}")))
}
