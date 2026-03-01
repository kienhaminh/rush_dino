use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AuditError {
    #[error("hash chain broken at sequence {seq}: expected {expected}, got {actual}")]
    ChainBroken { seq: i64, expected: String, actual: String },
    #[error("row hash mismatch at sequence {seq}")]
    RowHashMismatch { seq: i64 },
}

/// A single audit event, suitable for insertion into the `audit_log` SQLite table.
#[derive(Debug, Clone)]
pub struct AuditEvent {
    pub event_type: String,
    pub payload_json: String,
    pub created_at: String,
}

/// Compute `SHA-256(prev_hash || event_type || payload_json || created_at)`.
pub fn compute_row_hash(prev_hash: &str, event: &AuditEvent) -> String {
    let mut hasher = Sha256::new();
    hasher.update(prev_hash.as_bytes());
    hasher.update(event.event_type.as_bytes());
    hasher.update(event.payload_json.as_bytes());
    hasher.update(event.created_at.as_bytes());
    hex::encode(hasher.finalize())
}

/// Represents a persisted audit row as read back from the database.
#[derive(Debug, Clone)]
pub struct AuditRow {
    pub seq: i64,
    pub event_type: String,
    pub payload_json: String,
    pub created_at: String,
    pub prev_hash: String,
    pub row_hash: String,
}

/// Verify the integrity of an ordered list of audit rows.
///
/// The first row's `prev_hash` must be the genesis hash `"0"`.
pub fn verify_chain(rows: &[AuditRow]) -> Result<(), AuditError> {
    let mut expected_prev = "0".to_owned();

    for row in rows {
        if row.prev_hash != expected_prev {
            return Err(AuditError::ChainBroken {
                seq: row.seq,
                expected: expected_prev,
                actual: row.prev_hash.clone(),
            });
        }

        let event = AuditEvent {
            event_type: row.event_type.clone(),
            payload_json: row.payload_json.clone(),
            created_at: row.created_at.clone(),
        };
        let expected_row_hash = compute_row_hash(&row.prev_hash, &event);

        if expected_row_hash != row.row_hash {
            return Err(AuditError::RowHashMismatch { seq: row.seq });
        }

        expected_prev = row.row_hash.clone();
    }

    Ok(())
}

/// The genesis/sentinel hash used for the first row's `prev_hash` field.
pub const GENESIS_HASH: &str = "0";

/// Ed25519 plugin manifest signing support.
pub mod signing {
    use base64::Engine;
    use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
    use thiserror::Error;

    #[derive(Debug, Error)]
    pub enum SigningError {
        #[error("invalid key bytes")]
        InvalidKey,
        #[error("signature verification failed")]
        VerificationFailed,
        #[error("invalid signature encoding")]
        InvalidSignature,
    }

    /// Sign a manifest payload with an Ed25519 signing key.
    ///
    /// Returns the base64url-encoded signature.
    pub fn sign_manifest(signing_key_bytes: &[u8; 32], manifest: &[u8]) -> String {
        let key = SigningKey::from_bytes(signing_key_bytes);
        let sig: Signature = key.sign(manifest);
        base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(sig.to_bytes())
    }

    /// Verify a manifest signature.
    pub fn verify_manifest(
        verifying_key_bytes: &[u8; 32],
        manifest: &[u8],
        signature_b64: &str,
    ) -> Result<(), SigningError> {
        use base64::Engine;
        let sig_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(signature_b64)
            .map_err(|_| SigningError::InvalidSignature)?;

        let sig_array: [u8; 64] = sig_bytes
            .try_into()
            .map_err(|_| SigningError::InvalidSignature)?;

        let verifying_key = VerifyingKey::from_bytes(verifying_key_bytes)
            .map_err(|_| SigningError::InvalidKey)?;
        let sig = Signature::from_bytes(&sig_array);

        verifying_key
            .verify(manifest, &sig)
            .map_err(|_| SigningError::VerificationFailed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_row(seq: i64, event_type: &str, prev_hash: &str) -> AuditRow {
        let event = AuditEvent {
            event_type: event_type.to_owned(),
            payload_json: r#"{"test":true}"#.to_owned(),
            created_at: "2025-01-01T00:00:00Z".to_owned(),
        };
        let row_hash = compute_row_hash(prev_hash, &event);
        AuditRow {
            seq,
            event_type: event.event_type,
            payload_json: event.payload_json,
            created_at: event.created_at,
            prev_hash: prev_hash.to_owned(),
            row_hash,
        }
    }

    #[test]
    fn valid_chain_passes() {
        let row1 = make_row(1, "startup", GENESIS_HASH);
        let row2 = make_row(2, "auth", &row1.row_hash);
        let row3 = make_row(3, "tool_exec", &row2.row_hash);
        assert!(verify_chain(&[row1, row2, row3]).is_ok());
    }

    #[test]
    fn tampered_chain_fails() {
        let row1 = make_row(1, "startup", GENESIS_HASH);
        let mut row2 = make_row(2, "auth", &row1.row_hash);
        // Tamper with the payload
        row2.payload_json = r#"{"tampered":true}"#.to_owned();
        let row3 = make_row(3, "tool_exec", &row2.row_hash);
        assert!(verify_chain(&[row1, row2, row3]).is_err());
    }

    #[test]
    fn ed25519_sign_verify_roundtrip() {
        use ed25519_dalek::SigningKey;
        use rand::rngs::OsRng;

        let signing_key = SigningKey::generate(&mut OsRng);
        let verifying_key = signing_key.verifying_key();

        let manifest = b"plugin manifest content";
        let sig = signing::sign_manifest(signing_key.as_bytes(), manifest);
        assert!(signing::verify_manifest(verifying_key.as_bytes(), manifest, &sig).is_ok());
    }
}
