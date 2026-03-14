use axum::{http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Db(Box<sqlx::Error>),
    #[error("migration error: {0}")]
    Migrate(Box<sqlx::migrate::MigrateError>),
    #[error("configuration error: {0}")]
    Config(Box<figment::Error>),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("provider error: {0}")]
    Provider(String),
    #[error("agent error: {0}")]
    Agent(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(String),
}

pub type Result<T> = std::result::Result<T, AppError>;

impl From<sqlx::Error> for AppError {
    fn from(value: sqlx::Error) -> Self {
        Self::Db(Box::new(value))
    }
}

impl From<sqlx::migrate::MigrateError> for AppError {
    fn from(value: sqlx::migrate::MigrateError) -> Self {
        Self::Migrate(Box::new(value))
    }
}

impl From<figment::Error> for AppError {
    fn from(value: figment::Error) -> Self {
        Self::Config(Box::new(value))
    }
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    error: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let status = match self {
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Validation(_) => StatusCode::BAD_REQUEST,
            Self::Config(_) | Self::Provider(_) | Self::Agent(_) => StatusCode::BAD_GATEWAY,
            Self::Db(_) | Self::Migrate(_) | Self::Io(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let body = Json(ErrorBody {
            error: self.to_string(),
        });
        (status, body).into_response()
    }
}
