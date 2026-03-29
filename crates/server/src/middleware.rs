use std::{
    net::IpAddr,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::{ConnectInfo, Request},
    http::{header, HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use tower_http::cors::CorsLayer;

use rushdino_common::AppConfig;
use rushdino_security::auth_hmac::{verify_request, AuthError, NonceCache};

use crate::routes::dashboard_auth::dashboard_session_cookie_from_headers;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

/// Build a CORS layer that restricts allowed origins to those in `config`.
///
/// If the `security.allowed_origins` list is empty, falls back to a
/// localhost-only policy (safe default for local dev).
pub fn cors_layer(config: &AppConfig) -> CorsLayer {
    let origins = &config.security.allowed_origins;
    if origins.is_empty() {
        let localhost: HeaderValue = "http://localhost:3000".parse().expect("valid origin");
        return CorsLayer::new()
            .allow_methods(tower_http::cors::Any)
            .allow_headers(tower_http::cors::Any)
            .allow_origin(localhost);
    }

    let parsed: Vec<HeaderValue> = origins
        .iter()
        .filter_map(|o| o.parse::<HeaderValue>().ok())
        .collect();

    if parsed.is_empty() {
        tracing::warn!("cors: no valid allowed_origins configured; using permissive fallback");
        return CorsLayer::permissive();
    }

    CorsLayer::new()
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any)
        .allow_origin(parsed)
}

// ---------------------------------------------------------------------------
// HMAC auth middleware
// ---------------------------------------------------------------------------

/// Shared HMAC authentication state, held in the Axum app state.
pub struct HmacAuthState {
    pub secret: Vec<u8>,
    pub nonce_cache: Arc<NonceCache>,
}

impl HmacAuthState {
    pub fn new(secret: Vec<u8>) -> Self {
        Self {
            secret,
            nonce_cache: Arc::new(NonceCache::new()),
        }
    }
}

/// Axum middleware that enforces HMAC-SHA256 authentication.
///
/// Skips auth for `/healthz` (liveness probe).
/// Returns `401 Unauthorized` on any auth failure.
pub async fn hmac_auth_middleware(
    axum::extract::State(state): axum::extract::State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path().to_owned();

    // Exempt health check from auth so load balancers can probe freely
    if path == "/healthz" {
        return next.run(request).await;
    }

    let hmac_state = match &state.hmac_auth {
        Some(s) => s,
        None => return next.run(request).await, // auth not enabled
    };

    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    let Some(auth_value) = auth_header else {
        return (StatusCode::UNAUTHORIZED, "missing Authorization header").into_response();
    };

    let method = request.method().as_str().to_owned();

    // Buffer the body so we can hash it, then reconstruct the request
    let (parts, body) = request.into_parts();
    let body_bytes = match axum::body::to_bytes(body, 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => return (StatusCode::BAD_REQUEST, "failed to read request body").into_response(),
    };

    let now_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let result = verify_request(
        &auth_value,
        now_unix,
        &method,
        &path,
        &body_bytes,
        &hmac_state.secret,
        &hmac_state.nonce_cache,
    );

    match result {
        Ok(()) => {
            let request = Request::from_parts(parts, axum::body::Body::from(body_bytes));
            next.run(request).await
        }
        Err(e) => {
            tracing::warn!("hmac auth rejected: {e}");
            let msg = match e {
                AuthError::TimestampExpired => "timestamp out of window",
                AuthError::ReplayedNonce => "replayed nonce",
                AuthError::InvalidSignature => "invalid signature",
                _ => "unauthorized",
            };
            (StatusCode::UNAUTHORIZED, msg).into_response()
        }
    }
}

pub async fn dashboard_auth_middleware(
    axum::extract::State(state): axum::extract::State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path().to_owned();
    let config = AppConfig::load_from_path(&state.config_path)
        .unwrap_or_else(|_| state.config().as_ref().clone());
    if !config.security.dashboard_auth_enabled || !dashboard_auth_required_path(&path) {
        return next.run(request).await;
    }

    let Some(token) = dashboard_session_cookie_from_headers(request.headers()) else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(JsonErrorBody {
                error: "dashboard_auth_required",
            }),
        )
            .into_response();
    };

    match state.dashboard_auth.validate_session(&token).await {
        Ok(Some(_)) => next.run(request).await,
        Ok(None) => (
            StatusCode::UNAUTHORIZED,
            Json(JsonErrorBody {
                error: "dashboard_auth_required",
            }),
        )
            .into_response(),
        Err(err) => {
            tracing::warn!("dashboard auth validation failed: {err}");
            (
                StatusCode::UNAUTHORIZED,
                Json(JsonErrorBody {
                    error: "dashboard_auth_required",
                }),
            )
                .into_response()
        }
    }
}

// ---------------------------------------------------------------------------
// Rate limiting middleware
// ---------------------------------------------------------------------------

/// Axum middleware that applies per-IP GCRA rate limiting.
///
/// Returns `429 Too Many Requests` with a `Retry-After` header when a limit
/// is exceeded.
pub async fn rate_limit_middleware(
    axum::extract::State(state): axum::extract::State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let limiters = match &state.rate_limiters {
        Some(l) => l,
        None => return next.run(request).await,
    };

    let path = request.uri().path().to_owned();
    let ip = extract_ip(&request);

    let result = match path.as_str() {
        "/api/chat" => limiters.chat.check(ip),
        "/api/ws/chat" => limiters.ws_chat.check(ip),
        "/api/channels/mobile/connect" => limiters.chat.check(ip),
        "/api/channels/mobile/ws" => limiters.ws_chat.check(ip),
        "/api/documents/ingest" => limiters.documents_ingest.check(ip),
        p if p.starts_with("/api/conversations") => limiters.conversations.check(ip),
        _ => Ok(()),
    };

    match result {
        Ok(()) => next.run(request).await,
        Err(e) => {
            let retry_after_secs = match e {
                rushdino_security::rate_limit::RateLimitError::Exceeded { retry_after_secs } => {
                    retry_after_secs
                }
            };
            tracing::debug!(
                "rate limit exceeded for {ip} on {path}; retry after {retry_after_secs}s"
            );
            let mut resp = (StatusCode::TOO_MANY_REQUESTS, "rate limit exceeded").into_response();
            if let Ok(v) = HeaderValue::from_str(&retry_after_secs.to_string()) {
                resp.headers_mut().insert("Retry-After", v);
            }
            resp
        }
    }
}

/// Extract the client IP from `X-Forwarded-For` (proxy mode) or the TCP peer address.
fn extract_ip(request: &Request) -> IpAddr {
    if let Some(forwarded) = request
        .headers()
        .get("X-Forwarded-For")
        .and_then(|v| v.to_str().ok())
    {
        if let Some(first) = forwarded.split(',').next() {
            if let Ok(ip) = first.trim().parse::<IpAddr>() {
                return ip;
            }
        }
    }

    request
        .extensions()
        .get::<ConnectInfo<std::net::SocketAddr>>()
        .map(|ci| ci.0.ip())
        .unwrap_or_else(|| "0.0.0.0".parse().unwrap())
}

#[derive(serde::Serialize)]
struct JsonErrorBody {
    error: &'static str,
}

fn dashboard_auth_required_path(path: &str) -> bool {
    match path {
        "/api/dashboard-auth/status"
        | "/api/dashboard-auth/exchange"
        | "/api/dashboard-auth/logout"
        | "/api/channels/mobile/connect"
        | "/api/channels/mobile/ws"
        | "/healthz" => false,
        "/api/ws/chat" => true,
        _ => path.starts_with("/api/"),
    }
}

#[cfg(test)]
mod tests {
    use super::dashboard_auth_required_path;

    #[test]
    fn dashboard_auth_path_guard_skips_public_auth_routes() {
        assert!(!dashboard_auth_required_path("/healthz"));
        assert!(!dashboard_auth_required_path("/api/dashboard-auth/status"));
        assert!(!dashboard_auth_required_path(
            "/api/dashboard-auth/exchange"
        ));
        assert!(!dashboard_auth_required_path("/api/dashboard-auth/logout"));
    }

    #[test]
    fn dashboard_auth_path_guard_protects_dashboard_api_and_ws_routes() {
        assert!(dashboard_auth_required_path("/api/chat"));
        assert!(dashboard_auth_required_path("/api/conversations"));
        assert!(dashboard_auth_required_path("/api/ws/chat"));
    }
}
