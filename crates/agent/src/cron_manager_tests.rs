use super::*;

async fn setup_manager() -> CronManager {
    let pool = SqlitePool::connect(":memory:").await.expect("memory db");
    rushdino_common::db::run_migrations(&pool)
        .await
        .expect("run migrations");
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
fn computes_next_cron_with_explicit_utc() {
    let now = DateTime::parse_from_rfc3339("2026-03-13T10:02:00Z")
        .expect("parse now")
        .with_timezone(&Utc);
    let utc_tz: Tz = "UTC".parse().unwrap();
    let next = next_cron_occurrence("*/5 * * * *", now, utc_tz).expect("next cron");
    assert_eq!(next.to_rfc3339(), "2026-03-13T10:05:00+00:00");
}

#[test]
fn cron_respects_timezone() {
    // 2026-03-13 22:30 UTC = 2026-03-14 07:30 KST (Asia/Seoul is UTC+9)
    let now = DateTime::parse_from_rfc3339("2026-03-13T22:30:00Z")
        .expect("parse now")
        .with_timezone(&Utc);
    let tz: Tz = "Asia/Seoul".parse().unwrap();

    // Cron: run at 8:00 KST = 23:00 UTC
    let next = next_cron_occurrence("0 8 * * *", now, tz).expect("next cron");
    assert_eq!(next.to_rfc3339(), "2026-03-13T23:00:00+00:00");

    // Same cron with UTC timezone — 8:00 UTC is next day
    let utc_tz: Tz = "UTC".parse().unwrap();
    let next_utc = next_cron_occurrence("0 8 * * *", now, utc_tz).expect("next cron utc");
    assert_eq!(next_utc.to_rfc3339(), "2026-03-14T08:00:00+00:00");
}

#[test]
fn invalid_timezone_returns_error() {
    let result = parse_timezone("Invalid/Zone");
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("invalid timezone"));
}

#[test]
fn detect_system_timezone_is_valid() {
    let tz_name = detect_system_timezone();
    let tz: Tz = tz_name.parse().expect("detected timezone must be valid IANA name");
    // Verify it can be used for cron matching
    let now = Utc::now();
    let next = next_cron_occurrence("0 0 * * *", now, tz).expect("next cron with detected tz");
    assert!(next > now);
}
