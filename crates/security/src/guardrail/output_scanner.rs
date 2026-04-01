use std::sync::Arc;

use super::pattern_registry::PatternRegistry;

/// Output filter that redacts secrets in execution results before they reach the LLM.
/// Reuses the same PatternRegistry as DataRedactor.
pub struct OutputScanner {
    registry: Arc<PatternRegistry>,
}

impl OutputScanner {
    pub fn new(registry: Arc<PatternRegistry>) -> Self {
        Self { registry }
    }

    /// Scan and redact secrets in output text.
    pub fn scan(&self, output: &str) -> String {
        self.registry.redact(output)
    }
}
