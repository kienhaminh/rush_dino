use super::pattern_registry::*;
use super::types::{SecretType, Sensitivity};

#[test]
fn detects_openai_api_key() {
    let registry = PatternRegistry::default();
    let input = "export OPENAI_API_KEY=sk-abc123def456ghi789jkl012";
    let matches = registry.scan(input);
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].pattern_type, SecretType::ApiKey);
    assert!(matches[0].matched_text.starts_with("sk-"));
}

#[test]
fn detects_private_key() {
    let registry = PatternRegistry::default();
    let input = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----";
    let matches = registry.scan(input);
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].pattern_type, SecretType::PrivateKey);
}

#[test]
fn detects_aws_access_key() {
    let registry = PatternRegistry::default();
    let input = "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE";
    let matches = registry.scan(input);
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].pattern_type, SecretType::ApiKey);
}

#[test]
fn detects_github_token() {
    let registry = PatternRegistry::default();
    let input = "GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12";
    let matches = registry.scan(input);
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].pattern_type, SecretType::ApiKey);
}

#[test]
fn no_false_positives_on_normal_text() {
    let registry = PatternRegistry::default();
    let input = "Hello world, this is a normal string with no secrets.";
    let matches = registry.scan(input);
    assert!(matches.is_empty());
}

#[test]
fn redacts_detected_secret() {
    let registry = PatternRegistry::default();
    let input = "export OPENAI_API_KEY=sk-abc123def456ghi789jkl012";
    let redacted = registry.redact(input);
    assert!(!redacted.contains("sk-abc123"));
    assert!(redacted.contains("[REDACTED:api_key:sha256:"));
}

#[test]
fn redact_preserves_non_secret_text() {
    let registry = PatternRegistry::default();
    let input = "export NAME=hello\nexport OPENAI_API_KEY=sk-abc123def456ghi789jkl012\nexport FOO=bar";
    let redacted = registry.redact(input);
    assert!(redacted.contains("export NAME=hello"));
    assert!(redacted.contains("export FOO=bar"));
    assert!(!redacted.contains("sk-abc123"));
}

#[test]
fn custom_pattern_works() {
    let mut registry = PatternRegistry::default();
    registry.add_pattern(PatternEntry {
        name: "internal_token".to_string(),
        regex: r"RUSH_[A-Za-z0-9]{32}".to_string(),
        pattern_type: SecretType::ApiKey,
    });
    let input = "token=RUSH_ABCDEFGHIJKLMNOPQRSTUVWXYZabcd";
    let matches = registry.scan(input);
    assert_eq!(matches.len(), 1);
}

#[test]
fn sensitivity_strict_catches_email() {
    let registry = PatternRegistry::with_sensitivity(Sensitivity::Strict);
    let input = "contact: user@example.com";
    let matches = registry.scan(input);
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].pattern_type, SecretType::Pii);
}

#[test]
fn sensitivity_standard_skips_email() {
    let registry = PatternRegistry::with_sensitivity(Sensitivity::Standard);
    let input = "contact: user@example.com";
    let matches = registry.scan(input);
    assert!(matches.is_empty());
}
