use rushdino_common::Result;

pub use rushdino_auth::oauth_pkce::OAuthTokens;

/// Backward-compatible wrapper that now delegates to the shared auth crate.
pub async fn run() -> Result<OAuthTokens> {
    rushdino_auth::oauth_pkce::run().await
}
