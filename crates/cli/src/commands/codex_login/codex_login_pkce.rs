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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_pkce() {
        let (verifier, challenge) = generate_pkce();
        
        // Verifier should be a base64url encoded 32-byte string, approx 43 chars
        assert!(!verifier.is_empty());
        assert_eq!(verifier.len(), 43); // ceil(32 * 4 / 3) = 43
        
        // Challenge should also be a base64url encoded 32-byte SHA256 string
        assert!(!challenge.is_empty());
        assert_eq!(challenge.len(), 43);

        // Ensure challenge matches SHA256 of verifier
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
        let mut hasher = sha2::Sha256::new();
        sha2::Digest::update(&mut hasher, verifier.as_bytes());
        let expected_challenge = URL_SAFE_NO_PAD.encode(sha2::Digest::finalize(hasher).as_slice());
        
        assert_eq!(challenge, expected_challenge);
    }

    #[test]
    fn test_random_state() {
        let state1 = random_state();
        let state2 = random_state();
        
        // 16 bytes encoded as hex = 32 characters
        assert_eq!(state1.len(), 32);
        assert_eq!(state2.len(), 32);
        
        // Ensure they are reasonably random
        assert_ne!(state1, state2);
    }
}
