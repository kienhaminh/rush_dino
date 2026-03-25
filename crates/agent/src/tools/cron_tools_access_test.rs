#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::json;
    use sqlx::SqlitePool;

    use crate::{
        cron_manager::CronManager,
        tool_registry::Tool,
        tools::cron_tools::cron_create_tool,
    };

    async fn setup_manager() -> Arc<CronManager> {
        let pool = SqlitePool::connect(":memory:").await.expect("memory db");
        for statement in include_str!("../../../common/migrations/001_init.sql").split(';') {
            let sql = statement.trim();
            if sql.is_empty() {
                continue;
            }
            sqlx::query(sql)
                .execute(&pool)
                .await
                .expect("run init migration");
        }
        Arc::new(CronManager::new(Arc::new(pool)))
    }

    #[tokio::test]
    async fn cron_create_rejects_invalid_payload() {
        let tool = cron_create_tool(setup_manager().await);
        let result = tool
            .execute(json!({
                "name": "Nightly digest"
                // missing required fields: schedule, target
            }))
            .await;

        assert!(result.is_err(), "missing required fields should be rejected");
    }
}
