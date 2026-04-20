use std::{str::FromStr, sync::Arc};

use sqlx::sqlite::SqliteConnectOptions;
use sqlx::SqlitePool;

use super::{AgentMessageState, AgentMessageStore};

async fn make_store() -> Arc<AgentMessageStore> {
    let opts = SqliteConnectOptions::from_str("sqlite::memory:")
        .unwrap()
        .foreign_keys(true);
    let pool = Arc::new(SqlitePool::connect_with(opts).await.unwrap());
    rushdino_common::db::run_migrations(&pool).await.unwrap();
    Arc::new(AgentMessageStore::new(pool))
}

#[tokio::test]
async fn send_persists_processing_metadata() {
    let store = make_store().await;

    let message = store
        .send(
            "main",
            "writer",
            "Please summarize this.",
            AgentMessageState::Pending,
            None,
        )
        .await
        .unwrap();

    assert_eq!(message.state, AgentMessageState::Pending);
    assert_eq!(message.reply_to_message_id, None);
    assert_eq!(message.failure_reason, None);

    let inbox = store.inbox("writer", true).await.unwrap();
    assert_eq!(inbox.len(), 1);
    assert_eq!(inbox[0].id, message.id);
    assert_eq!(inbox[0].state, AgentMessageState::Pending);
}

#[tokio::test]
async fn claim_next_pending_marks_message_processing_once() {
    let store = make_store().await;
    let pending = store
        .send(
            "main",
            "writer",
            "Reply with a short acknowledgement.",
            AgentMessageState::Pending,
            None,
        )
        .await
        .unwrap();

    let claimed = store.claim_next_pending("writer").await.unwrap().unwrap();
    assert_eq!(claimed.id, pending.id);
    assert_eq!(claimed.state, AgentMessageState::Processing);

    let second_claim = store.claim_next_pending("writer").await.unwrap();
    assert!(
        second_claim.is_none(),
        "message should only be claimable once"
    );
}

#[tokio::test]
async fn mark_processed_and_failed_update_message_state() {
    let store = make_store().await;
    let pending = store
        .send(
            "main",
            "writer",
            "Reply with 'done'.",
            AgentMessageState::Pending,
            None,
        )
        .await
        .unwrap();
    let _ = store.claim_next_pending("writer").await.unwrap();

    store.mark_processed(&pending.id).await.unwrap();
    let processed = store.get(&pending.id).await.unwrap().unwrap();
    assert_eq!(processed.state, AgentMessageState::Processed);
    assert_eq!(processed.failure_reason, None);

    let failed = store
        .send(
            "main",
            "writer",
            "This one should fail.",
            AgentMessageState::Pending,
            None,
        )
        .await
        .unwrap();
    let _ = store.claim_next_pending("writer").await.unwrap();

    store
        .mark_failed(&failed.id, "provider error")
        .await
        .unwrap();
    let failed_row = store.get(&failed.id).await.unwrap().unwrap();
    assert_eq!(failed_row.state, AgentMessageState::Failed);
    assert_eq!(failed_row.failure_reason.as_deref(), Some("provider error"));
}
