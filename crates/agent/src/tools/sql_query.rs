use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};
use rushdino_data_sources::{sql_client, DataSourceRegistry};

use crate::tool_registry::Tool;

pub struct SqlQueryTool {
    registry: Arc<DataSourceRegistry>,
}

impl SqlQueryTool {
    pub fn new(registry: Arc<DataSourceRegistry>) -> Self {
        Self { registry }
    }
}

#[async_trait]
impl Tool for SqlQueryTool {
    fn name(&self) -> &str {
        "sql_query"
    }

    fn description(&self) -> &str {
        "Execute a read-only SELECT query against a configured SQL database and return the results"
    }

    fn parameters(&self) -> Value {
        let dbs: Vec<String> = self
            .registry
            .sql_summary()
            .into_iter()
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
                    "description": "SELECT statement to execute"
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

        if !sql.trim().to_lowercase().starts_with("select") {
            return Err(AppError::Validation(
                "sql_query only accepts SELECT statements; use sql_execute for DML".to_owned(),
            ));
        }

        let source = self
            .registry
            .sql_source(database)
            .ok_or_else(|| AppError::Validation(format!("unknown database: '{database}'")))?;

        let rows = sql_client::sql_query(&source.pool, sql).await?;
        serde_json::to_string_pretty(&rows)
            .map_err(|e| AppError::Validation(format!("failed to encode SQL results: {e}")))
    }
}
