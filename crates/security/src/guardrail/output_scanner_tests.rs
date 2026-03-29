use super::output_scanner::*;
use super::pattern_registry::PatternRegistry;
use std::sync::Arc;

#[test]
fn redacts_secret_in_command_output() {
    let registry = Arc::new(PatternRegistry::default());
    let scanner = OutputScanner::new(registry);
    let output = "Connection string: postgres://user:sk-abc123def456ghi789jkl012@host/db";
    let result = scanner.scan(output);
    assert!(!result.contains("sk-abc123"));
    assert!(result.contains("[REDACTED:api_key:sha256:"));
}

#[test]
fn passes_clean_output_unchanged() {
    let registry = Arc::new(PatternRegistry::default());
    let scanner = OutputScanner::new(registry);
    let output = "Build succeeded. 42 tests passed.";
    let result = scanner.scan(output);
    assert_eq!(result, output);
}

#[test]
fn redacts_multiple_secrets_in_output() {
    let registry = Arc::new(PatternRegistry::default());
    let scanner = OutputScanner::new(registry);
    let output = "KEY1=sk-abc123def456ghi789jkl012\nKEY2=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12";
    let result = scanner.scan(output);
    assert!(!result.contains("sk-abc123"));
    assert!(!result.contains("ghp_ABCDEF"));
}
