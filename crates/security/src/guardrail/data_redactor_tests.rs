use super::data_redactor::*;
use super::pattern_registry::PatternRegistry;
use std::sync::Arc;

#[test]
fn redacts_api_key_in_input() {
    let registry = Arc::new(PatternRegistry::default());
    let redactor = DataRedactor::new(registry);
    let input = "Run: curl -H 'Authorization: Bearer sk-abc123def456ghi789jkl012' https://api.openai.com";
    let output = redactor.redact(input);
    assert!(!output.contains("sk-abc123"));
    assert!(output.contains("[REDACTED:api_key:sha256:"));
    assert!(output.contains("https://api.openai.com"));
}

#[test]
fn redacts_private_key_in_file_content() {
    let registry = Arc::new(PatternRegistry::default());
    let redactor = DataRedactor::new(registry);
    let input = "Config:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIB...\n-----END RSA PRIVATE KEY-----\nDone";
    let output = redactor.redact(input);
    assert!(!output.contains("BEGIN RSA PRIVATE KEY"));
    assert!(output.contains("[REDACTED:private_key:sha256:"));
    assert!(output.contains("Config:"));
    assert!(output.contains("Done"));
}

#[test]
fn preserves_text_without_secrets() {
    let registry = Arc::new(PatternRegistry::default());
    let redactor = DataRedactor::new(registry);
    let input = "Hello world, just normal code here. let x = 42;";
    let output = redactor.redact(input);
    assert_eq!(output, input);
}

#[test]
fn same_secret_produces_same_hash() {
    let registry = Arc::new(PatternRegistry::default());
    let redactor = DataRedactor::new(registry);
    let input1 = "key=sk-abc123def456ghi789jkl012";
    let input2 = "other=sk-abc123def456ghi789jkl012";
    let out1 = redactor.redact(input1);
    let out2 = redactor.redact(input2);
    assert!(out1.contains("sha256:"));
    assert!(out2.contains("sha256:"));
    // Both should have the same hash since same secret
    let hash1 = out1.split("sha256:").nth(1).and_then(|s| s.split(']').next()).unwrap_or("");
    let hash2 = out2.split("sha256:").nth(1).and_then(|s| s.split(']').next()).unwrap_or("");
    assert_eq!(hash1, hash2);
}
