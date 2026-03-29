use std::sync::Arc;

use super::pattern_registry::PatternRegistry;
use super::types::FilterDecision;

/// Input filter that redacts secrets and PII before content enters the LLM context.
/// Does NOT block — only transforms content.
pub struct DataRedactor {
    registry: Arc<PatternRegistry>,
}

impl DataRedactor {
    pub fn new(registry: Arc<PatternRegistry>) -> Self {
        Self { registry }
    }

    /// Redact secrets in the given text. Returns Transformed if any redaction occurred, Allow otherwise.
    pub fn process(&self, text: &str) -> FilterDecision {
        let redacted = self.registry.redact(text);
        if redacted != text {
            FilterDecision::Transformed(redacted)
        } else {
            FilterDecision::Allow
        }
    }

    /// Direct redaction — always returns the (possibly unchanged) text.
    pub fn redact(&self, text: &str) -> String {
        self.registry.redact(text)
    }
}
