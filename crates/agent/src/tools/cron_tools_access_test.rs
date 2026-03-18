#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::json;
    use sqlx::SqlitePool;

    use crate::{
        cron_manager::CronManager,
        tool_registry::Tool,
        tools::{
            cron_tools::cron_create_tool,
            shell_exec::{with_tool_execution_context, ToolExecutionContext},
        },
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
    async fn cron_create_rejects_non_general_assistant_context() {
        let tool = cron_create_tool(setup_manager().await);
        let result = with_tool_execution_context(
            ToolExecutionContext {
                session_id: None,
                conversation_id: Some("conv-1".to_owned()),
                run_id: None,
                agent_id: Some("researcher".to_owned()),
                delegation_depth: 1,
            },
            tool.execute(json!({
                "name": "Nightly digest",
                "schedule": { "kind": "cron", "expr": "0 9 * * *" },
                "target": {
                    "kind": "agent_turn",
                    "message": "Summarize the queue",
                    "agentId": "researcher"
                }
            })),
        )
        .await;

        let error = result.expect_err("non-general assistant should be rejected");
        assert!(error.to_string().contains("general-assistant"));
    }
}
