//! HMAC-SHA256 request signer (mirrors the server's auth scheme).

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

/// Build the `Authorization` header value for a signed request.
///
/// Canonical string: `{timestamp}:{nonce}:{METHOD}:{path}:{sha256(body)}`
pub fn authorization(secret: &[u8], method: &str, path: &str, body: &[u8]) -> String {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let body_hash = hex_lower(&Sha256::digest(body));
    let canonical = format!("{timestamp}:{nonce}:{method}:{path}:{body_hash}");

    let mut mac = HmacSha256::new_from_slice(secret).expect("hmac accepts any key length");
    mac.update(canonical.as_bytes());
    let signature = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());

    format!("HMAC-SHA256 {timestamp}.{nonce}.{signature}")
}

fn hex_lower(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
