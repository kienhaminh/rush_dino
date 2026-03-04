use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use argon2::{Argon2, Params};
use rand::{RngCore, rngs::OsRng};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Debug, Error)]
pub enum SecretsError {
    #[error("encryption failed")]
    EncryptionFailed,
    #[error("decryption failed: wrong password or corrupted vault")]
    DecryptionFailed,
    #[error("vault data is too short or malformed")]
    MalformedVault,
    #[error("key derivation failed: {0}")]
    KeyDerivation(String),
    #[error("serialization error: {0}")]
    Serialization(String),
}

const NONCE_LEN: usize = 12;
const SALT_LEN: usize = 32;

/// A secret key that is zeroed on drop.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SecretKey(pub Vec<u8>);

/// An API key string that is zeroed on drop.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct ApiKey(pub String);

/// Derive a 32-byte encryption key from a password using Argon2id.
///
/// Parameters: m=65536 KiB (64 MiB), t=3 iterations, p=4 parallelism.
pub fn derive_key(password: &[u8], salt: &[u8; SALT_LEN]) -> Result<SecretKey, SecretsError> {
    let params = Params::new(65536, 3, 4, Some(32))
        .map_err(|e| SecretsError::KeyDerivation(e.to_string()))?;
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);

    let mut key = vec![0u8; 32];
    argon2
        .hash_password_into(password, salt, &mut key)
        .map_err(|e| SecretsError::KeyDerivation(e.to_string()))?;
    Ok(SecretKey(key))
}

/// Encrypt `plaintext` with AES-256-GCM using the given key.
///
/// Vault layout: `nonce(12) || salt(32) || ciphertext`
pub fn encrypt_vault(plaintext: &[u8], key: &SecretKey, salt: &[u8; SALT_LEN]) -> Result<Vec<u8>, SecretsError> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key.0));

    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, plaintext).map_err(|_| SecretsError::EncryptionFailed)?;

    let mut blob = Vec::with_capacity(NONCE_LEN + SALT_LEN + ciphertext.len());
    blob.extend_from_slice(&nonce_bytes);
    blob.extend_from_slice(salt);
    blob.extend_from_slice(&ciphertext);
    Ok(blob)
}

/// Decrypt a vault blob produced by `encrypt_vault`.
///
/// The caller must already have derived `key` from the master password and the
/// embedded salt (which is extracted here and returned alongside the plaintext).
pub fn decrypt_vault(blob: &[u8], key: &SecretKey) -> Result<Vec<u8>, SecretsError> {
    if blob.len() < NONCE_LEN + SALT_LEN + 16 {
        return Err(SecretsError::MalformedVault);
    }

    let nonce = Nonce::from_slice(&blob[..NONCE_LEN]);
    // salt lives at [NONCE_LEN..NONCE_LEN+SALT_LEN] — extracted by the caller before calling this
    let ciphertext = &blob[NONCE_LEN + SALT_LEN..];

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key.0));
    cipher.decrypt(nonce, ciphertext).map_err(|_| SecretsError::DecryptionFailed)
}

/// Extract the salt embedded in a vault blob (bytes [12..44]).
pub fn extract_salt(blob: &[u8]) -> Result<[u8; SALT_LEN], SecretsError> {
    if blob.len() < NONCE_LEN + SALT_LEN {
        return Err(SecretsError::MalformedVault);
    }
    let mut salt = [0u8; SALT_LEN];
    salt.copy_from_slice(&blob[NONCE_LEN..NONCE_LEN + SALT_LEN]);
    Ok(salt)
}

/// Generate a fresh random 32-byte salt.
pub fn generate_salt() -> [u8; SALT_LEN] {
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    salt
}

/// Encrypt a `Serialize`able value into a vault blob.
pub fn seal<T: Serialize>(value: &T, password: &[u8]) -> Result<Vec<u8>, SecretsError> {
    let plaintext = serde_json::to_vec(value)
        .map_err(|e| SecretsError::Serialization(e.to_string()))?;
    let salt = generate_salt();
    let key = derive_key(password, &salt)?;
    encrypt_vault(&plaintext, &key, &salt)
}

/// Decrypt a vault blob and deserialize the value.
pub fn unseal<T: for<'de> Deserialize<'de>>(blob: &[u8], password: &[u8]) -> Result<T, SecretsError> {
    let salt = extract_salt(blob)?;
    let key = derive_key(password, &salt)?;
    let plaintext = decrypt_vault(blob, &key)?;
    serde_json::from_slice(&plaintext)
        .map_err(|e| SecretsError::Serialization(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Serialize, Deserialize, PartialEq, Debug)]
    struct TestPayload {
        api_key: String,
        token: String,
    }

    #[test]
    fn round_trip_seal_unseal() {
        let payload = TestPayload {
            api_key: "sk-1234".to_owned(),
            token: "secret-token".to_owned(),
        };
        let password = b"my-master-password";

        let blob = seal(&payload, password).expect("seal should succeed");
        assert!(!blob.is_empty());

        let recovered: TestPayload = unseal(&blob, password).expect("unseal should succeed");
        assert_eq!(recovered, payload);
    }

    #[test]
    fn wrong_password_fails() {
        let payload = TestPayload { api_key: "sk-x".to_owned(), token: "y".to_owned() };
        let blob = seal(&payload, b"correct").expect("seal");
        let result: Result<TestPayload, _> = unseal(&blob, b"wrong");
        assert!(result.is_err());
    }
}
