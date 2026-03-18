use serde_json::Value;
use sqlx::{any::AnyRow, AnyPool, Column, Row};

use rushdino_common::{AppError, Result};

/// Execute a SELECT query and return the result rows as a JSON array.
pub async fn sql_query(pool: &AnyPool, sql: &str) -> Result<Value> {
    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Validation(format!("SQL query error: {e}")))?;

    let result: Vec<Value> = rows.iter().map(row_to_json).collect();
    Ok(Value::Array(result))
}

/// Execute a DML statement (INSERT/UPDATE/DELETE) and return the number of
/// affected rows.
pub async fn sql_execute(pool: &AnyPool, sql: &str) -> Result<u64> {
    let result = sqlx::query(sql)
        .execute(pool)
        .await
        .map_err(|e| AppError::Validation(format!("SQL execute error: {e}")))?;
    Ok(result.rows_affected())
}

fn row_to_json(row: &AnyRow) -> Value {
    let mut map = serde_json::Map::new();
    for (idx, col) in row.columns().iter().enumerate() {
        let name = col.name().to_owned();
        map.insert(name, column_to_json(row, idx));
    }
    Value::Object(map)
}

/// Attempts to decode a column value into a `serde_json::Value` by trying
/// each concrete type in order (integer → float → bool → string → null).
fn column_to_json(row: &AnyRow, idx: usize) -> Value {
    // Integer
    match row.try_get::<Option<i64>, _>(idx) {
        Ok(Some(v)) => return Value::Number(v.into()),
        Ok(None) => return Value::Null,
        Err(_) => {}
    }
    // Float
    match row.try_get::<Option<f64>, _>(idx) {
        Ok(Some(v)) => {
            return serde_json::Number::from_f64(v)
                .map(Value::Number)
                .unwrap_or(Value::Null)
        }
        Ok(None) => return Value::Null,
        Err(_) => {}
    }
    // Boolean
    match row.try_get::<Option<bool>, _>(idx) {
        Ok(Some(v)) => return Value::Bool(v),
        Ok(None) => return Value::Null,
        Err(_) => {}
    }
    // String (most general text/blob fallback)
    match row.try_get::<Option<String>, _>(idx) {
        Ok(Some(v)) => return Value::String(v),
        Ok(None) => return Value::Null,
        Err(_) => {}
    }
    Value::Null
}
