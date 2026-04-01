use std::{
    collections::{HashMap, VecDeque},
    sync::Arc,
    time::{Duration, Instant},
};

use sqlx::SqlitePool;
use tokio::sync::{Mutex, Notify};
use uuid::Uuid;

use rushdino_common::Result;

use crate::system_broker::InputRequestStatus;
use crate::runtime::{
    store::{FieldUpdate, RunPatch, RunStore},
    RunDetail, RunKind, RunListFilter, RunOriginMetadata, RunPolicySnapshot, RunSnapshot, RunState,
};

/// Parameters for submitting an assistant run with full origin metadata.
pub struct AssistantRunParams<'a> {
    pub session_id: &'a str,
    pub conversation_id: &'a str,
    pub title: &'a str,
    pub input_text: &'a str,
    pub provider: &'a str,
    pub model: &'a str,
    pub origin: RunOriginMetadata,
}

#[derive(Debug, Clone)]
pub struct RunCounts {
    pub total: usize,
    pub active: usize,
    pub queued: usize,
    pub blocked: usize,
    pub failed: usize,
}

#[derive(Debug, Clone)]
pub struct AbortRunOutcome {
    pub snapshot: RunSnapshot,
    pub removed_from_queue: bool,
}

#[derive(Debug)]
struct SessionLane {
    active_run_id: Option<String>,
    queue: VecDeque<String>,
}

impl SessionLane {
    fn new() -> Self {
        Self {
            active_run_id: None,
            queue: VecDeque::new(),
        }
    }
}

pub struct AgentRuntime {
    store: RunStore,
    lanes: Mutex<HashMap<String, SessionLane>>,
    waiters: Mutex<HashMap<String, Arc<Notify>>>,
}

impl AgentRuntime {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self {
            store: RunStore::new(pool),
            lanes: Mutex::new(HashMap::new()),
            waiters: Mutex::new(HashMap::new()),
        }
    }

    pub async fn reconcile_incomplete_runs(&self) -> Result<()> {
        self.store.reconcile_incomplete_runs().await
    }

    pub async fn submit_assistant_run(
        &self,
        session_id: &str,
        conversation_id: &str,
        title: &str,
        input_text: &str,
        provider: &str,
        model: &str,
    ) -> Result<(RunSnapshot, bool)> {
        self.submit_assistant_run_with_origin(AssistantRunParams {
            session_id,
            conversation_id,
            title,
            input_text,
            provider,
            model,
            origin: RunOriginMetadata::default(),
        })
        .await
    }

    pub async fn submit_assistant_run_with_origin(
        &self,
        p: AssistantRunParams<'_>,
    ) -> Result<(RunSnapshot, bool)> {
        let run_id = Uuid::new_v4().to_string();
        let _snapshot = self
            .store
            .insert_run(NewRunRecord {
                id: run_id.clone(),
                kind: RunKind::Assistant,
                state: RunState::Queued,
                origin: p.origin,
                session_id: Some(p.session_id.to_owned()),
                conversation_id: Some(p.conversation_id.to_owned()),
                workflow_id: None,
                title: p.title.to_owned(),
                input_text: Some(p.input_text.to_owned()),
                provider: p.provider.to_owned(),
                model: p.model.to_owned(),
                fallback_profile_id: None,
                queue_position: None,
                policy: RunPolicySnapshot::default(),
            })
            .await?;

        let (start_now, queue_position) = self.enqueue_run(p.session_id, &run_id).await;
        let next = if start_now {
            self.mark_running(&run_id, "Run entered active execution.")
                .await?
        } else {
            self.store
                .patch_run(
                    &run_id,
                    RunPatch {
                        queue_position: FieldUpdate::Set(queue_position as i64),
                        event_type: Some("queued".to_owned()),
                        event_message: Some(format!(
                            "Run queued behind {} active item(s) in this session.",
                            queue_position.saturating_sub(1)
                        )),
                        ..RunPatch::default()
                    },
                )
                .await?
        };
        self.notify_run(&run_id).await;
        Ok((next, start_now))
    }

    pub async fn register_workflow_run(
        &self,
        run_id: &str,
        workflow_id: &str,
        title: &str,
        input_text: Option<&str>,
        provider: &str,
        model: &str,
    ) -> Result<RunSnapshot> {
        let snapshot = self
            .store
            .insert_run(NewRunRecord {
                id: run_id.to_owned(),
                kind: RunKind::Workflow,
                state: RunState::Queued,
                origin: RunOriginMetadata::default(),
                session_id: None,
                conversation_id: None,
                workflow_id: Some(workflow_id.to_owned()),
                title: title.to_owned(),
                input_text: input_text.map(ToOwned::to_owned),
                provider: provider.to_owned(),
                model: model.to_owned(),
                fallback_profile_id: None,
                queue_position: None,
                policy: RunPolicySnapshot::default(),
            })
            .await?;
        self.notify_run(run_id).await;
        Ok(snapshot)
    }

    pub async fn mark_running(&self, run_id: &str, message: &str) -> Result<RunSnapshot> {
        let snapshot = self
            .store
            .patch_run(
                run_id,
                RunPatch {
                    state: Some(RunState::Running),
                    queue_position: FieldUpdate::Clear,
                    set_started_at: true,
                    event_type: Some("running".to_owned()),
                    event_message: Some(message.to_owned()),
                    ..RunPatch::default()
                },
            )
            .await?;
        self.notify_run(run_id).await;
        Ok(snapshot)
    }

    pub async fn mark_tool_started(
        &self,
        run_id: &str,
        tool_name: &str,
        message: Option<String>,
    ) -> Result<RunSnapshot> {
        let snapshot = self
            .store
            .patch_run(
                run_id,
                RunPatch {
                    active_tool: FieldUpdate::Set(tool_name.to_owned()),
                    event_type: Some("tool_started".to_owned()),
                    event_message: message,
                    event_tool_name: Some(tool_name.to_owned()),
                    ..RunPatch::default()
                },
            )
            .await?;
        self.notify_run(run_id).await;
        Ok(snapshot)
    }

    pub async fn mark_tool_finished(
        &self,
        run_id: &str,
        tool_name: &str,
        is_error: bool,
        message: String,
    ) -> Result<RunSnapshot> {
        let snapshot = self
            .store
            .patch_run(
                run_id,
                RunPatch {
                    active_tool: FieldUpdate::Clear,
                    event_type: Some(if is_error {
                        "tool_failed".to_owned()
                    } else {
                        "tool_finished".to_owned()
                    }),
                    event_message: Some(message),
                    event_tool_name: Some(tool_name.to_owned()),
                    ..RunPatch::default()
                },
            )
            .await?;
        self.notify_run(run_id).await;
        Ok(snapshot)
    }

    pub async fn mark_awaiting_approval(
        &self,
        run_id: &str,
        tool_name: &str,
        policy: RunPolicySnapshot,
    ) -> Result<RunSnapshot> {
        let snapshot = self
            .store
            .patch_run(
                run_id,
                RunPatch {
                    state: Some(RunState::AwaitingApproval),
                    active_tool: FieldUpdate::Set(tool_name.to_owned()),
                    policy: Some(policy),
                    event_type: Some("approval_requested".to_owned()),
                    event_message: Some(format!(
                        "Run is waiting for operator approval before `{tool_name}` can continue."
                    )),
                    event_tool_name: Some(tool_name.to_owned()),
                    ..RunPatch::default()
                },
            )
            .await?;
        self.notify_run(run_id).await;
        Ok(snapshot)
    }

    pub async fn record_approval_resolution(
        &self,
        run_id: &str,
        approved: bool,
        reason: Option<String>,
    ) -> Result<RunSnapshot> {
        let current = self.store.get_run(run_id).await?;
        let policy = RunPolicySnapshot {
            decision: if approved { "allow" } else { "deny" }.to_owned(),
            approval_state: if approved { "approved" } else { "denied" }.to_owned(),
            sandbox_state: current.policy.sandbox_state.clone(),
            effective_scope: current.policy.effective_scope.clone(),
            reason: reason.or_else(|| current.policy.reason.clone()),
        };
        let snapshot = self
            .store
            .patch_run(
                run_id,
                RunPatch {
                    state: Some(if approved {
                        RunState::Running
                    } else if current.abort_requested {
                        RunState::Aborted
                    } else {
                        RunState::Blocked
                    }),
                    active_tool: if approved {
                        FieldUpdate::Keep
                    } else {
                        FieldUpdate::Clear
                    },
                    policy: Some(policy),
                    set_completed_at: !approved && current.abort_requested,
                    event_type: Some(if approved {
                        "approval_approved".to_owned()
                    } else if current.abort_requested {
                        "aborted".to_owned()
                    } else {
                        "approval_denied".to_owned()
                    }),
                    event_message: Some(if approved {
                        "Operator approved the pending action.".to_owned()
                    } else if current.abort_requested {
                        "Operator aborted the run while approval was pending.".to_owned()
                    } else {
                        "Operator denied the pending action.".to_owned()
                    }),
                    ..RunPatch::default()
                },
            )
            .await?;
        self.notify_run(run_id).await;
        Ok(snapshot)
    }

    pub async fn mark_awaiting_input(
        &self,
        run_id: &str,
        tool_name: &str,
    ) -> Result<RunSnapshot> {
        let snapshot = self
            .store
            .patch_run(
                run_id,
                RunPatch {
                    state: Some(RunState::AwaitingInput),
                    active_tool: FieldUpdate::Set(tool_name.to_owned()),
                    event_type: Some("input_requested".to_owned()),
                    event_message: Some(format!(
                        "Run is waiting for user input before `{tool_name}` can continue."
                    )),
                    event_tool_name: Some(tool_name.to_owned()),
                    ..RunPatch::default()
                },
            )
            .await?;
        self.notify_run(run_id).await;
        Ok(snapshot)
    }

    pub async fn record_input_resolution(
        &self,
        run_id: &str,
        status: InputRequestStatus,
    ) -> Result<RunSnapshot> {
        let current = self.store.get_run(run_id).await?;
        let was_aborted = current.abort_requested || current.state == RunState::Aborted;
        let snapshot = self
            .store
            .patch_run(
                run_id,
                RunPatch {
                    state: Some(if was_aborted {
                        RunState::Aborted
                    } else {
                        RunState::Running
                    }),
                    active_tool: if was_aborted {
                        FieldUpdate::Clear
                    } else {
                        FieldUpdate::Keep
                    },
                    set_completed_at: was_aborted,
                    event_type: Some(if was_aborted {
                        "aborted".to_owned()
                    } else {
                        match status {
                            InputRequestStatus::Submitted => "input_submitted".to_owned(),
                            InputRequestStatus::Cancelled => "input_cancelled".to_owned(),
                        }
                    }),
                    event_message: Some(if was_aborted {
                        "Run aborted while input was pending.".to_owned()
                    } else {
                        match status {
                            InputRequestStatus::Submitted => {
                                "User submitted the requested input.".to_owned()
                            }
                            InputRequestStatus::Cancelled => {
                                "User cancelled the requested input.".to_owned()
                            }
                        }
                    }),
                    ..RunPatch::default()
                },
            )
            .await?;
        self.notify_run(run_id).await;
        Ok(snapshot)
    }

    pub async fn mark_completed(&self, run_id: &str, output_text: &str) -> Result<RunSnapshot> {
        let current = self.store.get_run(run_id).await?;
        let snapshot = self
            .store
            .patch_run(
                run_id,
                RunPatch {
                    state: Some(if current.abort_requested {
                        RunState::Aborted
                    } else {
                        RunState::Completed
                    }),
                    output_text: FieldUpdate::Set(output_text.to_owned()),
                    active_tool: FieldUpdate::Clear,
                    set_completed_at: true,
                    event_type: Some(if current.abort_requested {
                        "aborted".to_owned()
                    } else {
                        "completed".to_owned()
                    }),
                    event_message: Some(if current.abort_requested {
                        "Run output was discarded because an abort was requested.".to_owned()
                    } else {
                        "Run completed successfully.".to_owned()
                    }),
                    ..RunPatch::default()
                },
            )
            .await?;
        self.notify_run(run_id).await;
        Ok(snapshot)
    }

    pub async fn record_output_text(&self, run_id: &str, output_text: &str) -> Result<RunSnapshot> {
        let snapshot = self
            .store
            .patch_run(
                run_id,
                RunPatch {
                    output_text: FieldUpdate::Set(output_text.to_owned()),
                    ..RunPatch::default()
                },
            )
            .await?;
        self.notify_run(run_id).await;
        Ok(snapshot)
    }

    pub async fn mark_failed(&self, run_id: &str, error: &str) -> Result<RunSnapshot> {
        let current = self.store.get_run(run_id).await?;
        let snapshot = self
            .store
            .patch_run(
                run_id,
                RunPatch {
                    state: Some(if current.abort_requested {
                        RunState::Aborted
                    } else {
                        RunState::Failed
                    }),
                    active_tool: FieldUpdate::Clear,
                    error: FieldUpdate::Set(error.to_owned()),
                    set_completed_at: true,
                    event_type: Some(if current.abort_requested {
                        "aborted".to_owned()
                    } else {
                        "failed".to_owned()
                    }),
                    event_message: Some(if current.abort_requested {
                        "Run was aborted before the failing work was committed.".to_owned()
                    } else {
                        error.to_owned()
                    }),
                    ..RunPatch::default()
                },
            )
            .await?;
        self.notify_run(run_id).await;
        Ok(snapshot)
    }

    pub async fn mark_blocked(&self, run_id: &str, reason: &str) -> Result<RunSnapshot> {
        let current = self.store.get_run(run_id).await?;
        let policy = RunPolicySnapshot {
            reason: Some(reason.to_owned()),
            ..current.policy.clone()
        };
        let snapshot = self
            .store
            .patch_run(
                run_id,
                RunPatch {
                    state: Some(if current.abort_requested {
                        RunState::Aborted
                    } else {
                        RunState::Blocked
                    }),
                    active_tool: FieldUpdate::Clear,
                    policy: Some(policy),
                    error: FieldUpdate::Set(reason.to_owned()),
                    set_completed_at: current.abort_requested,
                    event_type: Some(if current.abort_requested {
                        "aborted".to_owned()
                    } else {
                        "blocked".to_owned()
                    }),
                    event_message: Some(reason.to_owned()),
                    ..RunPatch::default()
                },
            )
            .await?;
        self.notify_run(run_id).await;
        Ok(snapshot)
    }

    pub async fn record_event(
        &self,
        run_id: &str,
        event_type: &str,
        message: impl Into<String>,
    ) -> Result<RunSnapshot> {
        let snapshot = self
            .store
            .patch_run(
                run_id,
                RunPatch {
                    event_type: Some(event_type.to_owned()),
                    event_message: Some(message.into()),
                    ..RunPatch::default()
                },
            )
            .await?;
        self.notify_run(run_id).await;
        Ok(snapshot)
    }

    pub async fn finish_assistant_run(&self, run_id: &str) -> Result<Option<String>> {
        let current = self.store.get_run(run_id).await?;
        let Some(session_id) = current.session_id.as_deref() else {
            self.notify_run(run_id).await;
            return Ok(None);
        };

        let next_run = self.advance_lane(session_id, run_id).await?;
        self.notify_run(run_id).await;
        Ok(next_run)
    }

    pub async fn abort_run(&self, run_id: &str) -> Result<AbortRunOutcome> {
        let snapshot = self.store.get_run(run_id).await?;
        if snapshot.state.is_terminal() {
            return Ok(AbortRunOutcome {
                snapshot,
                removed_from_queue: false,
            });
        }

        if snapshot.state == RunState::Queued {
            let removed = if let Some(session_id) = snapshot.session_id.as_deref() {
                self.remove_queued_run(session_id, run_id).await?
            } else {
                false
            };
            let aborted = self
                .store
                .patch_run(
                    run_id,
                    RunPatch {
                        state: Some(RunState::Aborted),
                        abort_requested: Some(true),
                        set_completed_at: true,
                        policy: Some(RunPolicySnapshot {
                            reason: Some("Run aborted before execution started.".to_owned()),
                            ..snapshot.policy.clone()
                        }),
                        event_type: Some("aborted".to_owned()),
                        event_message: Some("Run aborted before execution started.".to_owned()),
                        ..RunPatch::default()
                    },
                )
                .await?;
            self.notify_run(run_id).await;
            return Ok(AbortRunOutcome {
                snapshot: aborted,
                removed_from_queue: removed,
            });
        }

        let patch = if matches!(snapshot.state, RunState::AwaitingApproval | RunState::AwaitingInput)
        {
            let waiting_message = if snapshot.state == RunState::AwaitingInput {
                "Run aborted while input was pending.".to_owned()
            } else {
                "Run aborted while approval was pending.".to_owned()
            };
            RunPatch {
                state: Some(RunState::Aborted),
                abort_requested: Some(true),
                active_tool: FieldUpdate::Clear,
                set_completed_at: true,
                policy: Some(RunPolicySnapshot {
                    reason: Some(waiting_message.clone()),
                    ..snapshot.policy.clone()
                }),
                event_type: Some("aborted".to_owned()),
                event_message: Some(waiting_message),
                ..RunPatch::default()
            }
        } else {
            RunPatch {
                abort_requested: Some(true),
                event_type: Some("abort_requested".to_owned()),
                event_message: Some(
                    "Abort requested. The runtime will stop the run after the active step returns."
                        .to_owned(),
                ),
                ..RunPatch::default()
            }
        };
        let updated = self.store.patch_run(run_id, patch).await?;
        self.notify_run(run_id).await;
        Ok(AbortRunOutcome {
            snapshot: updated,
            removed_from_queue: false,
        })
    }

    pub async fn wait_for_run(
        &self,
        run_id: &str,
        timeout: Duration,
        require_terminal: bool,
    ) -> Result<RunSnapshot> {
        let started = Instant::now();
        loop {
            let snapshot = self.store.get_run(run_id).await?;
            if if require_terminal {
                snapshot.state.is_terminal()
            } else {
                snapshot.state.is_wait_target()
            } {
                return Ok(snapshot);
            }

            let remaining = timeout.saturating_sub(started.elapsed());
            if remaining.is_zero() {
                return Ok(snapshot);
            }

            let waiter = self.waiter_for(run_id).await;
            if tokio::time::timeout(remaining, waiter.notified())
                .await
                .is_err()
            {
                return self.store.get_run(run_id).await;
            }
        }
    }

    pub async fn get_run(&self, run_id: &str) -> Result<RunSnapshot> {
        self.store.get_run(run_id).await
    }

    pub async fn get_run_detail(&self, run_id: &str, event_limit: i64) -> Result<RunDetail> {
        self.store.get_run_detail(run_id, event_limit).await
    }

    pub async fn list_runs(&self, filter: RunListFilter) -> Result<Vec<RunSnapshot>> {
        self.store.list_runs(filter).await
    }

    pub async fn list_session_runs(
        &self,
        conversation_id: &str,
        limit: i64,
    ) -> Result<Vec<RunSnapshot>> {
        self.store
            .list_runs(RunListFilter {
                conversation_id: Some(conversation_id.to_owned()),
                limit,
                ..RunListFilter::default()
            })
            .await
    }

    pub async fn delete_session_runs(&self, conversation_id: &str) -> Result<()> {
        self.store.delete_by_conversation_id(conversation_id).await
    }

    pub async fn counts(&self) -> Result<RunCounts> {
        let runs = self
            .store
            .list_runs(RunListFilter {
                limit: 500,
                ..RunListFilter::default()
            })
            .await?;
        Ok(RunCounts {
            total: runs.len(),
            active: runs
                .iter()
                .filter(|run| {
                    matches!(
                        run.state,
                        RunState::Running | RunState::AwaitingApproval | RunState::AwaitingInput
                    )
                })
                .count(),
            queued: runs
                .iter()
                .filter(|run| run.state == RunState::Queued)
                .count(),
            blocked: runs
                .iter()
                .filter(|run| run.state == RunState::Blocked)
                .count(),
            failed: runs
                .iter()
                .filter(|run| run.state == RunState::Failed)
                .count(),
        })
    }

    async fn enqueue_run(&self, session_id: &str, run_id: &str) -> (bool, usize) {
        let mut lanes = self.lanes.lock().await;
        let lane = lanes
            .entry(session_id.to_owned())
            .or_insert_with(SessionLane::new);
        if lane.active_run_id.is_none() {
            lane.active_run_id = Some(run_id.to_owned());
            return (true, 0);
        }

        lane.queue.push_back(run_id.to_owned());
        (false, lane.queue.len())
    }

    async fn advance_lane(
        &self,
        session_id: &str,
        completed_run_id: &str,
    ) -> Result<Option<String>> {
        let next_run = {
            let mut lanes = self.lanes.lock().await;
            let Some(lane) = lanes.get_mut(session_id) else {
                return Ok(None);
            };

            if lane.active_run_id.as_deref() == Some(completed_run_id) {
                lane.active_run_id = None;
            }

            let next_run = lane.queue.pop_front();
            if let Some(next_run_id) = next_run.clone() {
                lane.active_run_id = Some(next_run_id);
            } else if lane.active_run_id.is_none() {
                lanes.remove(session_id);
            }
            next_run
        };

        self.renumber_queue(session_id).await?;

        if let Some(next_run_id) = next_run.clone() {
            self.mark_running(
                &next_run_id,
                "Run dequeued and started after the previous item finished.",
            )
            .await?;
        }

        Ok(next_run)
    }

    async fn remove_queued_run(&self, session_id: &str, run_id: &str) -> Result<bool> {
        let removed = {
            let mut lanes = self.lanes.lock().await;
            let Some(lane) = lanes.get_mut(session_id) else {
                return Ok(false);
            };
            let before = lane.queue.len();
            lane.queue.retain(|candidate| candidate != run_id);
            let removed = before != lane.queue.len();
            if lane.queue.is_empty() && lane.active_run_id.is_none() {
                lanes.remove(session_id);
            }
            removed
        };
        if removed {
            self.renumber_queue(session_id).await?;
        }
        Ok(removed)
    }

    async fn renumber_queue(&self, session_id: &str) -> Result<()> {
        let queue = {
            let lanes = self.lanes.lock().await;
            lanes
                .get(session_id)
                .map(|lane| lane.queue.iter().cloned().collect::<Vec<_>>())
                .unwrap_or_default()
        };

        for (index, run_id) in queue.iter().enumerate() {
            self.store
                .patch_run(
                    run_id,
                    RunPatch {
                        queue_position: FieldUpdate::Set((index + 1) as i64),
                        ..RunPatch::default()
                    },
                )
                .await?;
            self.notify_run(run_id).await;
        }

        Ok(())
    }

    async fn waiter_for(&self, run_id: &str) -> Arc<Notify> {
        let mut waiters = self.waiters.lock().await;
        waiters
            .entry(run_id.to_owned())
            .or_insert_with(|| Arc::new(Notify::new()))
            .clone()
    }

    async fn notify_run(&self, run_id: &str) {
        if let Some(waiter) = self.waiters.lock().await.get(run_id).cloned() {
            waiter.notify_waiters();
        }
    }
}

pub use crate::runtime::store::NewRunRecord;

#[cfg(test)]
#[path = "service_tests.rs"]
mod tests;
