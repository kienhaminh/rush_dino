use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Weak};
use std::time::Duration;

use chrono::Utc;
use tokio::task::JoinSet;
use tokio::time;
use uuid::Uuid;

use rushdino_common::{models::Message, models::Role, AppError, Result};
use rushdino_providers::Provider;

use crate::{
    agent_manager::AgentManager,
    conversation::ConversationManager,
    engine::AgentConfig,
    memory::MemoryManager,
    react_loop::run_react_loop,
    runtime::AgentRuntime,
    tool_registry::{SessionToolContext, ToolRegistry},
    tools::bash::{with_tool_execution_context, ToolExecutionContext},
    workflow_manager::WorkflowManager,
    workflow_types::WorkflowRunExecutionStep,
};

/// Carries the outcome of a single step task back to the DAG loop.
struct StepTaskResult {
    run_step_id: String,
    step_id: String,
    step_name: String,
    position: i64,
    conversation_id: String,
    outcome: Result<String>,
}

/// Terminal disposition of a step — used when evaluating condition strings.
#[derive(Clone, Copy, PartialEq, Eq)]
enum StepDisposition {
    Succeeded,
    FailedOrSkipped,
}

#[derive(Clone)]
pub struct WorkflowRunner {
    provider: Arc<Provider>,
    tool_registry: Arc<ToolRegistry>,
    session_ctx: Weak<SessionToolContext>,
    conversation: Arc<ConversationManager>,
    memory: Arc<MemoryManager>,
    agent_manager: Arc<AgentManager>,
    manager: Arc<WorkflowManager>,
    runtime: Arc<AgentRuntime>,
    config: AgentConfig,
}

impl WorkflowRunner {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        provider: Arc<Provider>,
        tool_registry: Arc<ToolRegistry>,
        session_ctx: Weak<SessionToolContext>,
        conversation: Arc<ConversationManager>,
        memory: Arc<MemoryManager>,
        agent_manager: Arc<AgentManager>,
        manager: Arc<WorkflowManager>,
        runtime: Arc<AgentRuntime>,
        config: AgentConfig,
    ) -> Self {
        Self {
            provider,
            tool_registry,
            session_ctx,
            conversation,
            memory,
            agent_manager,
            manager,
            runtime,
            config,
        }
    }

    pub fn spawn_run(&self, run_id: String) {
        let this = self.clone();
        tokio::spawn(async move {
            if let Err(err) = this.execute_run(&run_id).await {
                tracing::error!(run_id = %run_id, error = %err, "workflow run execution failed");
                let _ = this
                    .manager
                    .mark_run_failed(&run_id, &format!("workflow execution error: {err}"))
                    .await;
                let _ = this
                    .runtime
                    .mark_failed(&run_id, &format!("workflow execution error: {err}"))
                    .await;
            }
        });
    }

    /// Execute a workflow run using a parallel DAG executor.
    ///
    /// Steps without explicit `depends_on` are treated as linear (each depends on the
    /// previous step by ascending position). Steps with `depends_on = Some([])` have no
    /// dependencies and start immediately. Steps with `depends_on = Some(ids)` wait for
    /// all listed step_ids.
    ///
    /// Steps blocked by a permanently-failed dependency are automatically skipped.
    /// Failed steps are retried up to `max_retries` times before being marked permanently
    /// failed. Condition strings (`"<step_name>.succeeded"` / `"<step_name>.failed"`) gate
    /// whether a ready step is dispatched or skipped.
    async fn execute_run(&self, run_id: &str) -> Result<()> {
        let context = self.manager.load_execution_context(run_id).await?;
        self.manager.mark_run_running(run_id).await?;
        let _ = self
            .runtime
            .mark_running(run_id, "Workflow run entered active execution.")
            .await;

        // Sort steps by position ascending to establish the linear fallback order.
        let mut steps: Vec<WorkflowRunExecutionStep> = context.steps;
        steps.sort_by_key(|s| s.position);

        let total = steps.len();

        // position → step_id (for resolving linear predecessors).
        let step_by_position: HashMap<i64, String> = steps
            .iter()
            .map(|s| (s.position, s.step_id.clone()))
            .collect();

        // step_id → step (fast lookup).
        let steps_by_id: HashMap<String, WorkflowRunExecutionStep> = steps
            .iter()
            .map(|s| (s.step_id.clone(), s.clone()))
            .collect();

        // step_name → step_id (for condition evaluation).
        let step_id_by_name: HashMap<String, String> = steps
            .iter()
            .map(|s| (s.step_name.clone(), s.step_id.clone()))
            .collect();

        // Effective dependency map: step_id → Vec<dep step_id>.
        let deps_map: HashMap<String, Vec<String>> = steps
            .iter()
            .map(|step| {
                let deps = match &step.depends_on {
                    // None → linear: depends on the step immediately before this one (by position).
                    None => step_by_position
                        .get(&(step.position - 1))
                        .cloned()
                        .into_iter()
                        .collect(),
                    // Some([]) → no deps; starts immediately.
                    // Some(ids) → explicit dependency list.
                    Some(ids) => ids.clone(),
                };
                (step.step_id.clone(), deps)
            })
            .collect();

        // ── Runtime state ──────────────────────────────────────────────────────────
        // step_id → (step_name, output) for completed steps.
        let mut completed: HashMap<String, (String, String)> = HashMap::new();
        // step_ids permanently skipped (condition gate or blocked dep).
        let mut skipped: HashSet<String> = HashSet::new();
        // step_ids permanently failed (exhausted retries).
        let mut failed: HashSet<String> = HashSet::new();
        // run_step_ids already dispatched (prevents double-launching).
        let mut launched: HashSet<String> = HashSet::new();
        // per step_id retry attempts made so far (separate from the DB counter).
        let mut retry_counts: HashMap<String, u8> = HashMap::new();

        // JoinSet of in-flight step tasks.
        let mut in_flight: JoinSet<StepTaskResult> = JoinSet::new();

        // ── DAG execution loop ─────────────────────────────────────────────────────
        loop {
            // Check if everything is terminal before scanning for new work.
            let terminal_count = completed.len() + skipped.len() + failed.len();
            if terminal_count == total && in_flight.is_empty() {
                break;
            }

            let mut dispatched_any = false;

            // Collect step_ids to evaluate (avoids borrowing `deps_map` while mutating
            // `completed` / `skipped` / `failed` below).
            let candidate_ids: Vec<String> = deps_map.keys().cloned().collect();

            'steps: for step_id in candidate_ids {
                let step = match steps_by_id.get(&step_id) {
                    Some(s) => s.clone(),
                    None => continue,
                };

                // Skip already-terminal or already-launched steps.
                if completed.contains_key(&step_id)
                    || skipped.contains(&step_id)
                    || failed.contains(&step_id)
                    || launched.contains(&step.run_step_id)
                {
                    continue;
                }

                let dep_ids = &deps_map[&step_id];

                // If any direct dependency permanently failed → permanently skip this step.
                if dep_ids.iter().any(|d| failed.contains(d)) {
                    tracing::warn!(
                        run_id = %run_id,
                        step = %step.step_name,
                        "skipping step — a dependency permanently failed"
                    );
                    let _ = self.manager.mark_run_step_skipped(&step.run_step_id).await;
                    let _ = self
                        .runtime
                        .record_event(
                            run_id,
                            "workflow_step_skipped",
                            format!(
                                "Step {} ({}) skipped — dependency failed.",
                                step.position, step.step_name
                            ),
                        )
                        .await;
                    skipped.insert(step_id.clone());
                    continue;
                }

                // Not yet ready — at least one dep is still pending or in-flight.
                let all_deps_terminal = dep_ids
                    .iter()
                    .all(|d| completed.contains_key(d) || skipped.contains(d));
                if !all_deps_terminal {
                    continue 'steps;
                }

                // ── Evaluate condition gate ───────────────────────────────────────
                if let Some(cond) = &step.condition {
                    let cond_met =
                        evaluate_condition(cond, &completed, &skipped, &failed, &step_id_by_name);
                    if !cond_met {
                        tracing::info!(
                            run_id = %run_id,
                            step = %step.step_name,
                            condition = %cond,
                            "skipping step — condition not met"
                        );
                        let _ = self.manager.mark_run_step_skipped(&step.run_step_id).await;
                        let _ = self
                            .runtime
                            .record_event(
                                run_id,
                                "workflow_step_skipped",
                                format!(
                                    "Step {} ({}) skipped — condition `{}` not met.",
                                    step.position, step.step_name, cond
                                ),
                            )
                            .await;
                        skipped.insert(step_id.clone());
                        continue;
                    }
                }

                // ── Build step input ──────────────────────────────────────────────
                // Collect outputs in position order from all completed steps.
                let previous_outputs: Vec<(String, String)> = steps
                    .iter()
                    .filter_map(|s| {
                        completed
                            .get(&s.step_id)
                            .map(|(name, out)| (name.clone(), out.clone()))
                    })
                    .collect();

                let step_input = build_step_input(
                    &context.run_input,
                    &previous_outputs,
                    &step.step_name,
                    &step.instructions,
                );

                self.manager
                    .mark_run_step_running(&step.run_step_id, &step_input)
                    .await?;
                let _ = self
                    .runtime
                    .record_event(
                        run_id,
                        "workflow_step_running",
                        format!("Step {} ({}) is running.", step.position, step.step_name),
                    )
                    .await;

                let conversation_id = format!(
                    "workflow:{}:run:{}:step:{}",
                    context.workflow_id, context.run_id, step.position
                );

                launched.insert(step.run_step_id.clone());
                dispatched_any = true;

                // Clone everything the spawned task needs; WorkflowRunner is Send + Clone.
                let runner = self.clone();
                let run_id_owned = run_id.to_owned();
                let step_clone = step.clone();
                let step_input_clone = step_input;
                let conversation_id_clone = conversation_id;

                in_flight.spawn(async move {
                    let outcome = runner
                        .execute_step_with_timeout(
                            &run_id_owned,
                            &step_clone.agent_id,
                            &step_input_clone,
                            &conversation_id_clone,
                            step_clone.position,
                            &step_clone.step_name,
                            step_clone.timeout_secs,
                        )
                        .await;

                    StepTaskResult {
                        run_step_id: step_clone.run_step_id,
                        step_id: step_clone.step_id,
                        step_name: step_clone.step_name,
                        position: step_clone.position,
                        conversation_id: conversation_id_clone,
                        outcome,
                    }
                });
            }

            // ── Deadlock guard ─────────────────────────────────────────────────────
            // Nothing in-flight and nothing was newly dispatched but not all terminal.
            if in_flight.is_empty() && !dispatched_any {
                let terminal_now = completed.len() + skipped.len() + failed.len();
                if terminal_now < total {
                    return Err(AppError::Validation(
                        "workflow DAG deadlock: unreachable steps detected (possible cycle)"
                            .to_owned(),
                    ));
                }
                break;
            }

            // If we dispatched new tasks but there's nothing to await yet, loop again
            // to check for more immediately-ready steps before blocking.
            if in_flight.is_empty() {
                continue;
            }

            // ── Await the next completed task ──────────────────────────────────────
            let task_result = match in_flight.join_next().await {
                Some(Ok(r)) => r,
                Some(Err(join_err)) => {
                    return Err(AppError::Validation(format!(
                        "workflow step task panicked: {join_err}"
                    )));
                }
                None => break,
            };

            // ── Process task result ────────────────────────────────────────────────
            match task_result.outcome {
                Ok(output) => {
                    self.manager
                        .mark_run_step_succeeded(
                            &task_result.run_step_id,
                            &output,
                            &task_result.conversation_id,
                        )
                        .await?;
                    let _ = self
                        .runtime
                        .record_event(
                            run_id,
                            "workflow_step_completed",
                            format!(
                                "Step {} ({}) completed.",
                                task_result.position, task_result.step_name
                            ),
                        )
                        .await;
                    completed.insert(
                        task_result.step_id.clone(),
                        (task_result.step_name.clone(), output),
                    );
                }
                Err(err) => {
                    let error_text = err.to_string();
                    let retries_used = *retry_counts.get(&task_result.step_id).unwrap_or(&0);
                    let max_retries = steps_by_id
                        .get(&task_result.step_id)
                        .map(|s| s.max_retries)
                        .unwrap_or(0);

                    if retries_used < max_retries {
                        // Retry path: increment counters and remove from `launched` so
                        // the dispatch loop re-queues it on the next iteration.
                        tracing::warn!(
                            run_id = %run_id,
                            step = %task_result.step_name,
                            attempt = retries_used + 1,
                            max = max_retries,
                            error = %error_text,
                            "step failed — scheduling retry"
                        );
                        retry_counts.insert(task_result.step_id.clone(), retries_used + 1);
                        self.manager
                            .increment_run_step_retry(&task_result.run_step_id)
                            .await?;
                        // Remove from launched so the dispatch loop picks it up again.
                        launched.remove(&task_result.run_step_id);
                    } else {
                        // Permanently failed.
                        tracing::error!(
                            run_id = %run_id,
                            step = %task_result.step_name,
                            error = %error_text,
                            "step permanently failed"
                        );
                        self.manager
                            .mark_run_step_failed(
                                &task_result.run_step_id,
                                &error_text,
                                &task_result.conversation_id,
                            )
                            .await?;
                        let _ = self
                            .runtime
                            .record_event(
                                run_id,
                                "workflow_step_failed",
                                format!(
                                    "Step {} ({}) failed: {}",
                                    task_result.position, task_result.step_name, error_text
                                ),
                            )
                            .await;
                        failed.insert(task_result.step_id.clone());
                    }
                }
            }
        }

        // ── Final run status ───────────────────────────────────────────────────────
        if !failed.is_empty() {
            let failed_names: Vec<String> = failed
                .iter()
                .filter_map(|id| steps_by_id.get(id))
                .map(|s| s.step_name.clone())
                .collect();
            let error_msg = format!("steps failed: {}", failed_names.join(", "));
            self.manager.mark_run_failed(run_id, &error_msg).await?;
            let _ = self.runtime.mark_failed(run_id, &error_msg).await;
        } else {
            self.manager.mark_run_succeeded(run_id).await?;
            // Final output: completed step outputs in position order.
            let output = if completed.is_empty() {
                "Workflow completed without step output.".to_owned()
            } else {
                steps
                    .iter()
                    .filter_map(|s| {
                        completed
                            .get(&s.step_id)
                            .map(|(name, out)| format!("{name}:\n{out}"))
                    })
                    .collect::<Vec<_>>()
                    .join("\n\n")
            };
            let _ = self.runtime.mark_completed(run_id, &output).await;
        }

        Ok(())
    }

    /// Wraps `execute_step` with an optional wall-clock timeout.
    #[allow(clippy::too_many_arguments)]
    async fn execute_step_with_timeout(
        &self,
        run_id: &str,
        agent_id: &str,
        step_input: &str,
        conversation_id: &str,
        position: i64,
        step_name: &str,
        timeout_secs: Option<u64>,
    ) -> Result<String> {
        if let Some(secs) = timeout_secs {
            time::timeout(
                Duration::from_secs(secs),
                self.execute_step(
                    run_id,
                    agent_id,
                    step_input,
                    conversation_id,
                    position,
                    step_name,
                ),
            )
            .await
            .unwrap_or_else(|_| Err(AppError::Validation("step timed out".to_owned())))
        } else {
            self.execute_step(
                run_id,
                agent_id,
                step_input,
                conversation_id,
                position,
                step_name,
            )
            .await
        }
    }

    async fn execute_step(
        &self,
        run_id: &str,
        agent_id: &str,
        step_input: &str,
        conversation_id: &str,
        position: i64,
        step_name: &str,
    ) -> Result<String> {
        let template = self
            .agent_manager
            .get(agent_id)
            .ok_or_else(|| AppError::Validation(format!("unknown agent id: {agent_id}")))?;

        let memory_context = self.memory.load_context().unwrap_or_default();
        let system_content = if memory_context.trim().is_empty() {
            template.system_prompt
        } else {
            format!("{}\n\n{}", template.system_prompt, memory_context)
        };

        let messages = vec![
            Message {
                id: Uuid::new_v4().to_string(),
                role: Role::System,
                content: system_content,
                tool_calls: None,
                rich_content: None,
                created_at: Utc::now(),
            },
            Message {
                id: Uuid::new_v4().to_string(),
                role: Role::User,
                content: step_input.to_owned(),
                tool_calls: None,
                rich_content: None,
                created_at: Utc::now(),
            },
        ];

        let tool_context = ToolExecutionContext {
            session_id: None,
            conversation_id: Some(conversation_id.to_owned()),
            run_id: Some(run_id.to_owned()),
            delegation_depth: 0,
            workspace_override: None,
        };

        let session_ctx = self
            .session_ctx
            .upgrade()
            .ok_or_else(|| AppError::Agent("session context unavailable".to_owned()))?;
        let (response, all_messages) = with_tool_execution_context(
            tool_context,
            run_react_loop(
                self.provider.clone(),
                self.tool_registry.clone(),
                session_ctx,
                messages,
                &self.config,
                None,
            ),
        )
        .await?;

        let title = format!("workflow step {}: {}", position, step_name);
        self.conversation
            .create_conversation_with_id(conversation_id, &title)
            .await?;

        for message in &all_messages {
            self.conversation
                .save_message(conversation_id, message)
                .await?;
        }

        Ok(response.content)
    }
}

/// Evaluate a step condition string of the form `"<step_name>.succeeded"` or
/// `"<step_name>.failed"`.
///
/// Returns `true` when the step should be dispatched, `false` when it should be skipped.
///
/// - `"name.succeeded"` → `true` only if the named step succeeded (is in `completed`).
/// - `"name.failed"` → `true` only if the named step failed or was skipped.
/// - Unknown step name or unrecognised format → `false` (treat as not met).
fn evaluate_condition(
    condition: &str,
    completed: &HashMap<String, (String, String)>,
    skipped: &HashSet<String>,
    failed: &HashSet<String>,
    step_id_by_name: &HashMap<String, String>,
) -> bool {
    // Expected format: "<name>.<outcome>"
    let (dep_name, outcome) = match condition.rsplit_once('.') {
        Some(parts) => parts,
        None => return false,
    };

    let dep_id = match step_id_by_name.get(dep_name) {
        Some(id) => id,
        // Referenced step name does not exist → condition cannot be met.
        None => return false,
    };

    let disposition = if completed.contains_key(dep_id.as_str()) {
        StepDisposition::Succeeded
    } else if failed.contains(dep_id.as_str()) || skipped.contains(dep_id.as_str()) {
        StepDisposition::FailedOrSkipped
    } else {
        // Dep is still pending/in-flight — condition not evaluable yet.
        // Caller should not reach here (only called when all deps are terminal).
        return false;
    };

    match outcome {
        "succeeded" => disposition == StepDisposition::Succeeded,
        "failed" => disposition == StepDisposition::FailedOrSkipped,
        _ => false,
    }
}

fn build_step_input(
    run_input: &str,
    previous_outputs: &[(String, String)],
    step_name: &str,
    instructions: &str,
) -> String {
    let mut lines = vec![
        format!(
            "Workflow run input:\n{}",
            if run_input.is_empty() {
                "(none)"
            } else {
                run_input
            }
        ),
        "".to_owned(),
        format!("Current step: {step_name}"),
        format!("Step instructions:\n{instructions}"),
    ];

    if previous_outputs.is_empty() {
        lines.push("".to_owned());
        lines.push("Previous step outputs: (none)".to_owned());
    } else {
        lines.push("".to_owned());
        lines.push("Previous step outputs:".to_owned());
        for (index, (name, output)) in previous_outputs.iter().enumerate() {
            lines.push(format!("{}. {}\n{}", index + 1, name, output));
        }
    }

    lines.join("\n")
}
