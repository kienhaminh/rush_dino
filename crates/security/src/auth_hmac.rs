use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use thiserror::Error;

type HmacSha256 = Hmac<Sha256>;

/// Maximum allowed clock skew between client and server (seconds).
pub const MAX_CLOCK_SKEW_SECS: u64 = 60;
/// How long nonces are retained in the replay-prevention cache.
const NONCE_TTL: Duration = Duration::from_secs(5 * 60);

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("missing Authorization header")]
    MissingHeader,
    #[error("malformed Authorization header")]
    MalformedHeader,
    #[error("timestamp out of allowed window")]
    TimestampExpired,
    #[error("nonce already seen (replay attack)")]
    ReplayedNonce,
    #[error("invalid HMAC signature")]
    InvalidSignature,
}

/// Parsed components from an `Authorization: HMAC-SHA256 <token>` header.
#[derive(Debug, Clone)]
pub struct HmacToken {
    pub timestamp: u64,
    pub nonce: String,
    pub signature: String,
}

/// Parse the HMAC token from an Authorization header value.
///
/// Expected format: `HMAC-SHA256 <timestamp_unix>.<nonce>.<signature_base64url>`
pub fn parse_hmac_header(header_value: &str) -> Result<HmacToken, AuthError> {
    let value = header_value.trim_start_matches("HMAC-SHA256 ");
    if value == header_value {
        return Err(AuthError::MalformedHeader);
    }

    let parts: Vec<&str> = value.splitn(3, '.').collect();
    if parts.len() != 3 {
        return Err(AuthError::MalformedHeader);
    }

    let timestamp: u64 = parts[0].parse().map_err(|_| AuthError::MalformedHeader)?;

    Ok(HmacToken {
        timestamp,
        nonce: parts[1].to_owned(),
        signature: parts[2].to_owned(),
    })
}

/// Build the canonical message that the client signs:
/// `"<timestamp>:<nonce>:<METHOD>:<path>:<sha256_body_hex>"`
pub fn canonical_message(
    timestamp: u64,
    nonce: &str,
    method: &str,
    path: &str,
    body: &[u8],
) -> String {
    let body_hash = hex::encode(Sha256::digest(body));
    format!("{timestamp}:{nonce}:{method}:{path}:{body_hash}")
}

/// Compute HMAC-SHA256 over a canonical message using the given secret key.
///
/// Returns the base64url-no-pad encoded signature.
pub fn compute_hmac(secret: &[u8], message: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(message.as_bytes());
    let result = mac.finalize().into_bytes();
    URL_SAFE_NO_PAD.encode(result)
}

/// A simple in-memory nonce cache that evicts entries older than `NONCE_TTL`.
pub struct NonceCache {
    inner: Mutex<HashMap<String, Instant>>,
}

impl NonceCache {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    /// Returns `true` if the nonce is fresh (not yet seen), and inserts it.
    /// Returns `false` if the nonce was already seen (replay).
    pub fn check_and_insert(&self, nonce: &str) -> bool {
        let mut map = self.inner.lock().expect("nonce cache lock poisoned");
        // Evict expired entries
        let now = Instant::now();
        map.retain(|_, seen_at| now.duration_since(*seen_at) < NONCE_TTL);

        if map.contains_key(nonce) {
            return false;
        }
        map.insert(nonce.to_owned(), now);
        true
    }
}

impl Default for NonceCache {
    fn default() -> Self {
        Self::new()
    }
}

/// Full request-level auth verification.
///
/// Checks:
/// 1. Token parses correctly
/// 2. Timestamp is within ±`MAX_CLOCK_SKEW_SECS` of `now_unix`
/// 3. Nonce has not been seen before
/// 4. HMAC matches in constant time
pub fn verify_request(
    header_value: &str,
    now_unix: u64,
    method: &str,
    path: &str,
    body: &[u8],
    secret: &[u8],
    nonce_cache: &NonceCache,
) -> Result<(), AuthError> {
    let token = parse_hmac_header(header_value)?;

    // Timestamp window check
    let diff = (now_unix as i64 - token.timestamp as i64).unsigned_abs();
    if diff > MAX_CLOCK_SKEW_SECS {
        return Err(AuthError::TimestampExpired);
    }

    // Replay check
    if !nonce_cache.check_and_insert(&token.nonce) {
        return Err(AuthError::ReplayedNonce);
    }

    // Signature check (constant-time compare)
    let expected = compute_hmac(
        secret,
        &canonical_message(token.timestamp, &token.nonce, method, path, body),
    );
    let sig_bytes = URL_SAFE_NO_PAD
        .decode(&token.signature)
        .map_err(|_| AuthError::InvalidSignature)?;
    let expected_bytes = URL_SAFE_NO_PAD
        .decode(&expected)
        .expect("compute_hmac produces valid base64");

    if sig_bytes.ct_eq(&expected_bytes).into() {
        Ok(())
    } else {
        Err(AuthError::InvalidSignature)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secret() -> &'static [u8] {
        b"test-secret-key-32-bytes-xxxxxxxx"
    }

    fn make_token(ts: u64, method: &str, path: &str, body: &[u8]) -> String {
        let nonce = "abc123";
        let sig = compute_hmac(secret(), &canonical_message(ts, nonce, method, path, body));
        format!("HMAC-SHA256 {ts}.{nonce}.{sig}")
    }

    #[test]
    fn valid_request_accepted() {
        let cache = NonceCache::new();
        let now = 1_700_000_000u64;
        let header = make_token(now, "POST", "/api/chat", b"{}");
        assert!(verify_request(&header, now, "POST", "/api/chat", b"{}", secret(), &cache).is_ok());
    }

    #[test]
    fn expired_timestamp_rejected() {
        let cache = NonceCache::new();
        let now = 1_700_000_000u64;
        let old = now - 120;
        let header = make_token(old, "POST", "/api/chat", b"{}");
        let result = verify_request(&header, now, "POST", "/api/chat", b"{}", secret(), &cache);
        assert!(matches!(result, Err(AuthError::TimestampExpired)));
    }

    #[test]
    fn replay_rejected() {
        let cache = NonceCache::new();
        let now = 1_700_000_000u64;
        let header = make_token(now, "POST", "/api/chat", b"{}");
        assert!(verify_request(&header, now, "POST", "/api/chat", b"{}", secret(), &cache).is_ok());
        // Second request with same nonce — different timestamp but same nonce string
        let header2 = make_token(now + 1, "POST", "/api/chat", b"{}");
        // Make the nonce the same by constructing manually
        let sig = compute_hmac(
            secret(),
            &canonical_message(now + 1, "abc123", "POST", "/api/chat", b"{}"),
        );
        let header2 = format!("HMAC-SHA256 {}.abc123.{sig}", now + 1);
        let result = verify_request(
            &header2,
            now + 1,
            "POST",
            "/api/chat",
            b"{}",
            secret(),
            &cache,
        );
        assert!(matches!(result, Err(AuthError::ReplayedNonce)));
    }

    #[test]
    fn wrong_signature_rejected() {
        let cache = NonceCache::new();
        let now = 1_700_000_000u64;
        let header =
            format!("HMAC-SHA256 {now}.nonce1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
        let result = verify_request(&header, now, "POST", "/api/chat", b"{}", secret(), &cache);
        assert!(matches!(result, Err(AuthError::InvalidSignature)));
    }
}
