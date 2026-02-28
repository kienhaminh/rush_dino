//! PKCE (Proof Key for Code Exchange) and OAuth state helpers for Codex login.
//!
//! Provides `generate_pkce()` and `random_state()` used by the top-level
//! `codex_login::run()` to start an OAuth 2.0 PKCE flow.

use sha2::{Digest, Sha256};

/// Generate a PKCE (verifier, challenge) pair using SHA-256 / base64url encoding.
///
/// Returns `(verifier, challenge)` where:
/// - `verifier` is a random 32-byte value encoded as base64url (no padding)
/// - `challenge` is `BASE64URL(SHA256(verifier))`
pub fn generate_pkce() -> (String, String) {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    let verifier_bytes: Vec<u8> = (0..32).map(|_| rand::random::<u8>()).collect();
    let verifier = URL_SAFE_NO_PAD.encode(&verifier_bytes);
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize().as_slice());
    (verifier, challenge)
}

/// Generate a random hex-encoded OAuth state token (16 bytes → 32 hex chars).
///
/// Used to prevent CSRF attacks during the OAuth authorization flow.
pub fn random_state() -> String {
    let bytes: Vec<u8> = (0..16).map(|_| rand::random::<u8>()).collect();
    hex::encode(bytes)
}
