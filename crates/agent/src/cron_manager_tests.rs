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
