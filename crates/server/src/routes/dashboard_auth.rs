use axum::{
    extract::State,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use rushdino_common::AppConfig;

use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardAuthStatusResponse {
    pub enabled: bool,
    pub authenticated: bool,
    pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DashboardAuthExchangeRequest {
    pub code: String,
}

pub async fn get_status(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let config = AppConfig::load_from_path(&state.config_path)
        .unwrap_or_else(|_| state.config().as_ref().clone());
    if !config.security.dashboard_auth_enabled {
        return Json(DashboardAuthStatusResponse {
            enabled: false,
            authenticated: false,
            expires_at: None,
        })
        .into_response();
    }

    let Some(token) = dashboard_session_cookie_from_headers(&headers) else {
        return Json(DashboardAuthStatusResponse {
            enabled: true,
            authenticated: false,
            expires_at: None,
        })
        .into_response();
    };

    match state.dashboard_auth.validate_session(&token).await {
        Ok(Some(session)) => Json(DashboardAuthStatusResponse {
            enabled: true,
            authenticated: true,
            expires_at: Some(session.expires_at),
        })
        .into_response(),
        Ok(None) => Json(DashboardAuthStatusResponse {
            enabled: true,
            authenticated: false,
            expires_at: None,
        })
        .into_response(),
        Err(err) => {
            tracing::warn!("dashboard auth status: session validation failed: {err}");
            Json(DashboardAuthStatusResponse {
                enabled: true,
                authenticated: false,
                expires_at: None,
            })
            .into_response()
        }
    }
}

pub async fn exchange(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<DashboardAuthExchangeRequest>,
) -> impl IntoResponse {
    let config = AppConfig::load_from_path(&state.config_path)
        .unwrap_or_else(|_| state.config().as_ref().clone());
    if !config.security.dashboard_auth_enabled {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "dashboard auth is disabled" })),
        )
            .into_response();
    }

    match state
        .dashboard_auth
        .exchange_code(payload.code.trim())
        .await
    {
        Ok(session) => {
            let mut response = Json(DashboardAuthStatusResponse {
                enabled: true,
                authenticated: true,
                expires_at: Some(session.expires_at),
            })
            .into_response();
            if let Ok(cookie) = build_dashboard_session_cookie(&session.token, &headers) {
                response.headers_mut().append(header::SET_COOKIE, cookie);
            }
            response
        }
        Err(_) => (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "dashboard_auth_invalid_code" })),
        )
            .into_response(),
    }
}

pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Some(token) = dashboard_session_cookie_from_headers(&headers) {
        let _ = state.dashboard_auth.revoke_session(&token).await;
    }

    let mut response = StatusCode::NO_CONTENT.into_response();
    if let Ok(cookie) = build_dashboard_session_clear_cookie() {
        response.headers_mut().append(header::SET_COOKIE, cookie);
    }
    response
}

pub(crate) fn dashboard_session_cookie_from_headers(headers: &HeaderMap) -> Option<String> {
    let cookie_header = headers.get(header::COOKIE)?.to_str().ok()?;
    cookie_header.split(';').find_map(|pair| {
        let (name, value) = pair.trim().split_once('=')?;
        if name == "rushdino_dashboard_session" {
            Some(value.to_owned())
        } else {
            None
        }
    })
}

fn build_dashboard_session_cookie(token: &str, headers: &HeaderMap) -> Result<HeaderValue, ()> {
    let mut cookie = format!(
        "rushdino_dashboard_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={}",
        7 * 24 * 60 * 60
    );
    if request_is_https(headers) {
        cookie.push_str("; Secure");
    }

    HeaderValue::from_str(&cookie).map_err(|_| ())
}

fn build_dashboard_session_clear_cookie() -> Result<HeaderValue, ()> {
    HeaderValue::from_str(
        "rushdino_dashboard_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
    )
    .map_err(|_| ())
}

fn request_is_https(headers: &HeaderMap) -> bool {
    headers
        .get("x-forwarded-proto")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.eq_ignore_ascii_case("https"))
}

#[cfg(test)]
mod tests {
    use axum::http::{header, HeaderMap, HeaderValue};

    use super::{build_dashboard_session_cookie, dashboard_session_cookie_from_headers};

    #[test]
    fn parses_dashboard_session_cookie_from_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("foo=bar; rushdino_dashboard_session=abc123; baz=qux"),
        );

        let token = dashboard_session_cookie_from_headers(&headers);
        assert_eq!(token.as_deref(), Some("abc123"));
    }

    #[test]
    fn marks_cookie_secure_for_https_requests() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-proto", HeaderValue::from_static("https"));

        let cookie_header =
            build_dashboard_session_cookie("token123", &headers).expect("cookie should build");
        let cookie = cookie_header
            .to_str()
            .expect("cookie should be valid header");

        assert!(cookie.contains("; Secure"));
    }
}
