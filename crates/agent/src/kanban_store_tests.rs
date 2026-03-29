use super::*;

#[test]
fn task_priority_roundtrip() {
    for p in [
        TaskPriority::Low,
        TaskPriority::Medium,
        TaskPriority::High,
        TaskPriority::Critical,
    ] {
        assert_eq!(TaskPriority::from_str_loose(p.as_str()), p);
    }
}

#[test]
fn task_status_roundtrip() {
    for s in [
        TaskStatus::Backlog,
        TaskStatus::Claimed,
        TaskStatus::InProgress,
        TaskStatus::Blocked,
        TaskStatus::InReview,
        TaskStatus::Done,
        TaskStatus::Failed,
    ] {
        assert_eq!(TaskStatus::from_str_loose(s.as_str()), s);
    }
}

#[test]
fn priority_weight_ordering() {
    assert!(TaskPriority::Critical.weight() > TaskPriority::High.weight());
    assert!(TaskPriority::High.weight() > TaskPriority::Medium.weight());
    assert!(TaskPriority::Medium.weight() > TaskPriority::Low.weight());
}

#[test]
fn tags_parsing_handles_empty_and_whitespace() {
    let row = KanbanTaskRow {
        id: "t1".into(),
        source_request_id: None,
        parent_task_id: None,
        title: "test".into(),
        description: "desc".into(),
        tags: " code , architecture , ".into(),
        priority: "medium".into(),
        status: "backlog".into(),
        assigned_agent: None,
        conversation_id: None,
        result: None,
        review_feedback: None,
        block_reason: None,
        complexity_level: 2,
        depth: 0,
        created_at: "2026-01-01T00:00:00Z".into(),
        updated_at: "2026-01-01T00:00:00Z".into(),
        claimed_at: None,
        completed_at: None,
        revision_count: 0,
        notify_conversation_id: None,
    };
    let task = row.into_task();
    assert_eq!(task.tags, vec!["code", "architecture"]);
}

async fn test_store() -> KanbanStore {
    let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();
    sqlx::query(
        "CREATE TABLE kanban_tasks (
            id TEXT PRIMARY KEY,
            source_request_id TEXT,
            parent_task_id TEXT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '',
            priority TEXT NOT NULL DEFAULT 'medium',
            status TEXT NOT NULL DEFAULT 'backlog',
            assigned_agent TEXT,
            conversation_id TEXT,
            result TEXT,
            review_feedback TEXT,
            block_reason TEXT,
            complexity_level INTEGER NOT NULL DEFAULT 2,
            depth INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            claimed_at TEXT,
            completed_at TEXT,
            revision_count INTEGER NOT NULL DEFAULT 0,
            notify_conversation_id TEXT
        )",
    )
    .execute(&pool)
    .await
    .unwrap();
    KanbanStore::new(std::sync::Arc::new(pool))
}

#[tokio::test]
async fn notify_conversation_id_stored_and_retrieved() {
    let store = test_store().await;
    let input = CreateTaskInput {
        title: "test".into(),
        description: "desc".into(),
        tags: vec![],
        priority: TaskPriority::Medium,
        parent_task_id: None,
        source_request_id: None,
        complexity_level: 1,
        notify_conversation_id: Some("main".into()),
    };
    let task = store.create_task(&input).await.unwrap();
    assert_eq!(task.notify_conversation_id.as_deref(), Some("main"));
}
