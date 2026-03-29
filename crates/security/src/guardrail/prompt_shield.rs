use regex::Regex;

use super::types::*;

/// A section of content flagged as potentially containing prompt injection.
#[derive(Debug, Clone)]
pub struct FlaggedSection {
    pub text: String,
    pub start: usize,
    pub end: usize,
    pub reason: String,
}

/// Result of PromptShield scanning.
#[derive(Debug)]
pub struct ShieldResult {
    pub confidence: Confidence,
    pub flagged_sections: Vec<FlaggedSection>,
}

struct InjectionPattern {
    regex: Regex,
    weight: f32,
    reason: String,
}

/// Output filter that detects prompt injection in external content.
pub struct PromptShield {
    patterns: Vec<InjectionPattern>,
}

impl Default for PromptShield {
    fn default() -> Self {
        let patterns = vec![
            InjectionPattern {
                regex: Regex::new(r"(?i)ignore\s+(all\s+)?previous\s+instructions").unwrap(),
                weight: 0.9,
                reason: "Instruction override attempt".to_string(),
            },
            InjectionPattern {
                regex: Regex::new(r"(?i)disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|guidelines)").unwrap(),
                weight: 0.9,
                reason: "Instruction override attempt".to_string(),
            },
            InjectionPattern {
                regex: Regex::new(r"(?i)do\s+not\s+follow\s+(previous|prior|your)\s+(instructions|rules)").unwrap(),
                weight: 0.85,
                reason: "Instruction override attempt".to_string(),
            },
            InjectionPattern {
                regex: Regex::new(r"(?i)you\s+are\s+now\s+(a|an)\s+").unwrap(),
                weight: 0.7,
                reason: "Role reassignment attempt".to_string(),
            },
            InjectionPattern {
                regex: Regex::new(r"(?i)your\s+new\s+role\s+is").unwrap(),
                weight: 0.8,
                reason: "Role reassignment attempt".to_string(),
            },
            InjectionPattern {
                regex: Regex::new(r"</?system>").unwrap(),
                weight: 0.85,
                reason: "System tag injection".to_string(),
            },
            InjectionPattern {
                regex: Regex::new(r"\[/?INST\]").unwrap(),
                weight: 0.85,
                reason: "Instruction tag injection".to_string(),
            },
            InjectionPattern {
                regex: Regex::new(r"<</?SYS>>").unwrap(),
                weight: 0.85,
                reason: "System delimiter injection".to_string(),
            },
            InjectionPattern {
                regex: Regex::new(r"</tool_result>").unwrap(),
                weight: 0.9,
                reason: "Tool result delimiter breakout".to_string(),
            },
            InjectionPattern {
                regex: Regex::new(r"(?i)(reveal|output|show|dump|print)\s+(all\s+)?(system\s+prompt|private|secret|internal|memory)").unwrap(),
                weight: 0.75,
                reason: "Data exfiltration attempt".to_string(),
            },
        ];

        Self { patterns }
    }
}

impl PromptShield {
    /// Scan content for prompt injection. Only scans untrusted sources.
    pub fn scan(&self, content: &str, source: &SourceTag) -> ShieldResult {
        if !source.is_untrusted() {
            return ShieldResult {
                confidence: Confidence::new(0.0),
                flagged_sections: vec![],
            };
        }

        let mut flagged = Vec::new();
        let mut max_weight: f32 = 0.0;

        for pattern in &self.patterns {
            for m in pattern.regex.find_iter(content) {
                flagged.push(FlaggedSection {
                    text: m.as_str().to_string(),
                    start: m.start(),
                    end: m.end(),
                    reason: pattern.reason.clone(),
                });
                if pattern.weight > max_weight {
                    max_weight = pattern.weight;
                }
            }
        }

        // Boost confidence if multiple patterns match
        let confidence = if flagged.len() > 1 {
            (max_weight + 0.1).min(1.0)
        } else {
            max_weight
        };

        ShieldResult {
            confidence: Confidence::new(confidence),
            flagged_sections: flagged,
        }
    }

    /// Convenience method that returns a FilterDecision based on scan results.
    pub fn filter(&self, content: &str, source: &SourceTag) -> FilterDecision {
        let result = self.scan(content, source);

        if result.flagged_sections.is_empty() {
            return FilterDecision::Allow;
        }

        let summary: Vec<String> = result
            .flagged_sections
            .iter()
            .map(|f| format!("'{}' ({})", f.text, f.reason))
            .collect();
        let message = format!("Potential prompt injection detected: {}", summary.join(", "));

        if result.confidence.high() {
            FilterDecision::NeedsApproval(message)
        } else if result.confidence.medium() {
            FilterDecision::Flagged(message)
        } else {
            FilterDecision::Allow
        }
    }
}
