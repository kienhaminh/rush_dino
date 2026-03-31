use std::sync::Arc;

use sqlx::sqlite::SqlitePoolOptions;
use tokio::time::{sleep, Duration};

use rushdino_common::db::run_migrations;

use super::*;
use crate::InputRequestStatus;

async fn create_runtime() -> AgentRuntime {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect runtime test sqlite");
    run_migrations(&pool).await.expect("run migrations");
    AgentRuntime::new(Arc::new(pool))
}

#[tokio::test]
async fn assistant_runs_queue_fifo_and_renumber_after_abort() {
    let runtime = create_runtime().await;

    let (first, first_started) = runtime
        .submit_assistant_run("session-1", "conv-1", "First", "one", "openai", "gpt-5")
        .await
        .expect("submit first run");
    let (second, second_started) = runtime
        .submit_assistant_run("session-1", "conv-1", "Second", "two", "openai", "gpt-5")
        .await
        .expect("submit second run");
    let (third, third_started) = runtime
        .submit_assistant_run("session-1", "conv-1", "Third", "three", "openai", "gpt-5")
        .await
        .expect("submit third run");

    assert!(first_started);
    assert!(!second_started);
    assert!(!third_started);
    assert_eq!(first.state, RunState::Running);
    assert_eq!(second.state, RunState::Queued);
    assert_eq!(second.queue_position, Some(1));
    assert_eq!(third.queue_position, Some(2));

    let aborted = runtime
        .abort_run(&second.id)
        .await
        .expect("abort queued run");
    assert!(aborted.removed_from_queue);
    assert_eq!(aborted.snapshot.state, RunState::Aborted);

    let renumbered = runtime.get_run(&third.id).await.expect("reload third");
    assert_eq!(renumbered.queue_position, Some(1));

    runtime
        .mark_completed(&first.id, "first finished")
        .await
        .expect("complete first");
    let next_run = runtime
        .finish_assistant_run(&first.id)
        .await
        .expect("advance queue");

    assert_eq!(next_run.as_deref(), Some(third.id.as_str()));
    let promoted = runtime
        .get_run(&third.id)
        .await
        .expect("reload promoted run");
    assert_eq!(promoted.state, RunState::Running);
    assert_eq!(promoted.queue_position, None);
}

#[tokio::test]
async fn wait_for_run_returns_terminal_update_and_cached_result() {
    let runtime = Arc::new(create_runtime().await);
    let (run, _) = runtime
        .submit_assistant_run("session-2", "conv-2", "Wait", "body", "openai", "gpt-5")
        .await
        .expect("submit run");
    let run_id = run.id.clone();
    let worker = runtime.clone();

    tokio::spawn(async move {
        sleep(Duration::from_millis(50)).await;
        worker
            .mark_completed(&run_id, "done")
            .await
            .expect("complete waiting run");
        worker
            .finish_assistant_run(&run_id)
            .await
            .expect("finish waiting run");
    });

    let waited = runtime
        .wait_for_run(&run.id, Duration::from_secs(1), true)
        .await
        .expect("wait for terminal state");
    assert_eq!(waited.state, RunState::Completed);
    assert_eq!(waited.output_text.as_deref(), Some("done"));

    let cached = runtime
        .wait_for_run(&run.id, Duration::from_millis(1), true)
        .await
        .expect("read cached terminal state");
    assert_eq!(cached.state, RunState::Completed);
    assert_eq!(cached.output_text.as_deref(), Some("done"));
}

#[tokio::test]
async fn wait_for_run_returns_current_state_after_timeout() {
    let runtime = create_runtime().await;
    let (run, _) = runtime
        .submit_assistant_run("session-3", "conv-3", "Timeout", "body", "openai", "gpt-5")
        .await
        .expect("submit run");

    let snapshot = runtime
        .wait_for_run(&run.id, Duration::from_millis(10), true)
        .await
        .expect("wait with timeout");

    assert_eq!(snapshot.state, RunState::Running);
    assert!(snapshot.completed_at.is_none());
}

#[tokio::test]
async fn input_request_transitions_resume_running_and_abort_cleanly() {
    let runtime = create_runtime().await;
    let (run, _) = runtime
        .submit_assistant_run("session-4", "conv-4", "Input", "body", "openai", "gpt-5")
        .await
        .expect("submit run");

    let awaiting = runtime
        .mark_awaiting_input(&run.id, "request_user_input")
        .await
        .expect("mark awaiting input");
    assert_eq!(awaiting.state, RunState::AwaitingInput);

    let resumed = runtime
        .record_input_resolution(&run.id, InputRequestStatus::Submitted)
        .await
        .expect("resume after input");
    assert_eq!(resumed.state, RunState::Running);

    runtime
        .mark_awaiting_input(&run.id, "request_user_input")
        .await
        .expect("mark awaiting input again");
    let aborted = runtime.abort_run(&run.id).await.expect("abort waiting run");
    assert_eq!(aborted.snapshot.state, RunState::Aborted);

    let resolved_after_abort = runtime
        .record_input_resolution(&run.id, InputRequestStatus::Cancelled)
        .await
        .expect("resolution after abort should preserve aborted state");
    assert_eq!(resolved_after_abort.state, RunState::Aborted);
}

#[tokio::test]
async fn stream_output_persists_partial_text_before_completion() {
    let runtime = create_runtime().await;
    let (run, _) = runtime
        .submit_assistant_run("session-5", "conv-5", "Streaming", "body", "openai", "gpt-5")
        .await
        .expect("submit run");

    let updated = runtime
        .record_output_text(&run.id, "partial streamed answer")
        .await
        .expect("persist partial streamed output");

    assert_eq!(updated.state, RunState::Running);
    assert_eq!(updated.output_text.as_deref(), Some("partial streamed answer"));

    let reloaded = runtime.get_run(&run.id).await.expect("reload run");
    assert_eq!(reloaded.output_text.as_deref(), Some("partial streamed answer"));
}
