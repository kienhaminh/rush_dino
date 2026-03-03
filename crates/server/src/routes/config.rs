//! Config API routes — read and update AppConfig / CredentialsConfig from the UI.
//!
//! GET  /api/config        — return current AppConfig as JSON
//! PATCH /api/config       — merge JSON patch into AppConfig, save to disk
//! GET  /api/credentials   — return CredentialsConfig with secrets redacted as "***"
//! PATCH /api/credentials  — merge JSON patch, skip fields whose value is "***"

use axum::{extract::State, Json};
use serde_json::Value;

use rushdino_common::{AppConfig, AppError, CredentialsConfig, Result};

use crate::state::AppState;

/// Redaction sentinel — returned in place of non-empty secret values on GET.
const REDACTED: &str = "***";

/// GET /api/config — return the on-disk AppConfig as JSON.
pub async fn get_config(State(state): State<AppState>) -> Result<Json<Value>> {
    let config = AppConfig::load_from_path(&state.config_path)?;
    let value = serde_json::to_value(&config)
        .map_err(|e| AppError::Validation(format!("serialization error: {e}")))?;
    Ok(Json(value))
}

/// PATCH /api/config — deep-merge the JSON body into the current config and save.
pub async fn patch_config(
    State(state): State<AppState>,
    Json(patch): Json<Value>,
) -> Result<Json<Value>> {
    // Load the current config from disk, then merge the patch on top.
    let current = AppConfig::load_from_path(&state.config_path)?;
    let mut current_value = serde_json::to_value(&current)
        .map_err(|e| AppError::Validation(format!("serialization error: {e}")))?;
    json_merge(&mut current_value, patch);

    // Validate by deserializing into AppConfig before saving.
    let updated: AppConfig = serde_json::from_value(current_value)
        .map_err(|e| AppError::Validation(format!("invalid config: {e}")))?;
    updated.save_to_path(&state.config_path)?;

    let result = serde_json::to_value(&updated)
        .map_err(|e| AppError::Validation(format!("serialization error: {e}")))?;
    Ok(Json(result))
}

/// GET /api/credentials — return CredentialsConfig with non-empty secrets replaced by "***".
pub async fn get_credentials(State(state): State<AppState>) -> Result<Json<Value>> {
    let creds = CredentialsConfig::load_from_path(&state.credentials_path)?;
    let mut value = serde_json::to_value(&creds)
        .map_err(|e| AppError::Validation(format!("serialization error: {e}")))?;
    redact_secrets(&mut value);
    Ok(Json(value))
}

/// PATCH /api/credentials — merge patch, skipping any field whose value is "***".
pub async fn patch_credentials(
    State(state): State<AppState>,
    Json(patch): Json<Value>,
) -> Result<Json<Value>> {
    let current = CredentialsConfig::load_from_path(&state.credentials_path)?;
    let mut current_value = serde_json::to_value(&current)
        .map_err(|e| AppError::Validation(format!("serialization error: {e}")))?;

    // Strip "***" sentinel values from patch so they don't overwrite existing secrets.
    let patch = strip_redacted(patch);
    json_merge(&mut current_value, patch);

    let updated: CredentialsConfig = serde_json::from_value(current_value)
        .map_err(|e| AppError::Validation(format!("invalid credentials: {e}")))?;
    updated.save_to_path(&state.credentials_path)?;

    // Return redacted view so we never leak secrets in responses.
    let mut result = serde_json::to_value(&updated)
        .map_err(|e| AppError::Validation(format!("serialization error: {e}")))?;
    redact_secrets(&mut result);
    Ok(Json(result))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Recursively replace non-empty string values with "***" for credentials view.
fn redact_secrets(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for v in map.values_mut() {
                if let Value::String(s) = v {
                    if !s.is_empty() {
                        *s = REDACTED.to_owned();
                    }
                } else {
                    redact_secrets(v);
                }
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                redact_secrets(v);
            }
        }
        _ => {}
    }
}

/// Remove any string fields equal to "***" from a JSON value (recursive).
/// Fields that are null are also preserved to allow explicit clearing.
fn strip_redacted(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let filtered = map
                .into_iter()
                .filter_map(|(k, v)| {
                    if matches!(&v, Value::String(s) if s == REDACTED) {
                        None // skip — user didn't change this field
                    } else {
                        Some((k, strip_redacted(v)))
                    }
                })
                .collect();
            Value::Object(filtered)
        }
        Value::Array(arr) => Value::Array(arr.into_iter().map(strip_redacted).collect()),
        other => other,
    }
}

/// Shallow/deep merge: `patch` values overwrite `base` values at the same path.
/// Objects are merged recursively; all other types are replaced.
fn json_merge(base: &mut Value, patch: Value) {
    match (base, patch) {
        (Value::Object(base_map), Value::Object(patch_map)) => {
            for (k, v) in patch_map {
                json_merge(base_map.entry(k).or_insert(Value::Null), v);
            }
        }
        (base, patch) => *base = patch,
    }
}
