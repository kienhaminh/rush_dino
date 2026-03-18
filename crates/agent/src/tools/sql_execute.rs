use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};
use rushdino_data_sources::{sql_client, DataSourceRegistry};

use crate::tool_registry::Tool;

pub struct SqlExecuteTool {
    registry: Arc<DataSourceRegistry>,
}

impl SqlExecuteTool {
    pub fn new(registry: Arc<DataSourceRegistry>) -> Self {
        Self { registry }
    }
}

#[async_trait]
impl Tool for SqlExecuteTool {
    fn name(&self) -> &str {
        "sql_exec"
    }

    fn description(&self) -> &str {
        "Execute a DML statement (INSERT, UPDATE, DELETE) against a configured SQL database"
    }

    fn parameters(&self) -> Value {
        let dbs: Vec<String> = self
            .registry
            .sql_summary()
            .into_iter()
            .filter(|_| true) // all dbs listed; read_only check happens at runtime
            .map(|(name, desc)| format!("{name}: {desc}"))
            .collect();

        json!({
            "type": "object",
            "properties": {
                "database": {
                    "type": "string",
                    "description": format!("Target database name. Available: {}", dbs.join(", "))
                },
                "sql": {
                    "type": "string",
                    "description": "INSERT, UPDATE, or DELETE statement to execute"
                }
            },
            "required": ["database", "sql"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let database = args
            .get("database")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("database is required".to_owned()))?;
        let sql = args
            .get("sql")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("sql is required".to_owned()))?;

        // Reject SELECT statements — use sql_query for reads.
        if sql.trim().to_lowercase().starts_with("select") {
            return Err(AppError::Validation(
                "sql_execute does not accept SELECT statements; use sql_query for reads".to_owned(),
            ));
        }

        let source = self
            .registry
            .sql_source(database)
            .ok_or_else(|| AppError::Validation(format!("unknown database: '{database}'")))?;

        if source.read_only {
            return Err(AppError::Validation(format!(
                "database '{database}' is configured as read-only"
            )));
        }

        let rows_affected = sql_client::sql_execute(&source.pool, sql).await?;
        Ok(format!(
            "Statement executed successfully. Rows affected: {rows_affected}"
        ))
    }
}
