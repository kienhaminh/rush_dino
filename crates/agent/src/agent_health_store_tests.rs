use super::*;

/// Build an in-memory SQLite pool with the required tables.
async fn test_pool() -> Arc<SqlitePool> {
    let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();
    sqlx::query(
        "CREATE TABLE agent_match_outcomes (
            id TEXT PRIMARY KEY,
            agent_name TEXT NOT NULL,
            task_id TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '',
            succeeded INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "CREATE TABLE agent_health_events (
            id TEXT PRIMARY KEY,
            agent_name TEXT NOT NULL,
            event_type TEXT NOT NULL,
            task_id TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL
        )",
    )
    .execute(&pool)
    .await
    .unwrap();

    Arc::new(pool)
}

#[tokio::test]
async fn no_history_returns_healthy() {
    let pool = test_pool().await;
    let store = AgentHealthStore::new(pool);
    let rate = store.get_success_rate("unknown-agent").await.unwrap();
    assert!((rate - 1.0).abs() < f64::EPSILON);
    assert!(!store.is_circuit_open("unknown-agent").await.unwrap());
}

#[tokio::test]
async fn all_successes_keeps_circuit_closed() {
    let pool = test_pool().await;
    let store = AgentHealthStore::new(pool);
    for i in 0..5 {
        store
            .record_outcome("agent-a", &format!("t{i}"), &[], true)
            .await
            .unwrap();
    }
    let rate = store.get_success_rate("agent-a").await.unwrap();
    assert!((rate - 1.0).abs() < f64::EPSILON);
    assert!(!store.is_circuit_open("agent-a").await.unwrap());
}

#[tokio::test]
async fn high_failure_rate_opens_circuit() {
    let pool = test_pool().await;
    let store = AgentHealthStore::new(pool);
    // 6 failures, 4 successes => 40% success => circuit open
    for i in 0..6 {
        store
            .record_outcome("agent-b", &format!("f{i}"), &["code".to_string()], false)
            .await
            .unwrap();
    }
    for i in 0..4 {
        store
            .record_outcome("agent-b", &format!("s{i}"), &["code".to_string()], true)
            .await
            .unwrap();
    }
    assert!(store.is_circuit_open("agent-b").await.unwrap());
}

#[tokio::test]
async fn recovery_closes_circuit() {
    let pool = test_pool().await;
    let store = AgentHealthStore::new(pool);
    // Start with failures
    for i in 0..10 {
        store
            .record_outcome("agent-c", &format!("f{i}"), &[], false)
            .await
            .unwrap();
    }
    assert!(store.is_circuit_open("agent-c").await.unwrap());

    // Now succeed enough to close the circuit (window=10, need >50% success)
    for i in 0..10 {
        store
            .record_outcome("agent-c", &format!("s{i}"), &[], true)
            .await
            .unwrap();
    }
    assert!(!store.is_circuit_open("agent-c").await.unwrap());
}
