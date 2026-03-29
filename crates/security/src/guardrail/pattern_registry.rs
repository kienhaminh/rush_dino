use regex::Regex;
use sha2::{Digest, Sha256};

use super::types::{SecretType, Sensitivity};

/// A single pattern entry in the registry.
#[derive(Debug, Clone)]
pub struct PatternEntry {
    pub name: String,
    pub regex: String,
    pub pattern_type: SecretType,
}

/// A match found by scanning.
#[derive(Debug, Clone)]
pub struct PatternMatch {
    pub pattern_type: SecretType,
    pub matched_text: String,
    pub start: usize,
    pub end: usize,
}

/// Compiled pattern for efficient repeated scanning.
struct CompiledPattern {
    regex: Regex,
    pattern_type: SecretType,
}

/// Registry of secret/PII detection patterns. Shared by DataRedactor and OutputScanner.
pub struct PatternRegistry {
    patterns: Vec<CompiledPattern>,
    sensitivity: Sensitivity,
}

impl Default for PatternRegistry {
    fn default() -> Self {
        Self::with_sensitivity(Sensitivity::Standard)
    }
}

impl PatternRegistry {
    pub fn with_sensitivity(sensitivity: Sensitivity) -> Self {
        let mut entries = vec![
            // Private keys — use (?s) flag to allow . to match newlines
            PatternEntry {
                name: "private_key".into(),
                regex: r"(?s)-----BEGIN[A-Z ]*PRIVATE KEY-----.*?-----END[A-Z ]*PRIVATE KEY-----".into(),
                pattern_type: SecretType::PrivateKey,
            },
            // OpenAI API keys
            PatternEntry {
                name: "openai_key".into(),
                regex: r"sk-[A-Za-z0-9]{20,}".into(),
                pattern_type: SecretType::ApiKey,
            },
            // GitHub tokens (classic PATs: ghp_ + 36 chars, fine token: github_pat_*)
            PatternEntry {
                name: "github_token".into(),
                regex: r"ghp_[A-Za-z0-9]{34,}".into(),
                pattern_type: SecretType::ApiKey,
            },
            // AWS access keys
            PatternEntry {
                name: "aws_access_key".into(),
                regex: r"AKIA[0-9A-Z]{16}".into(),
                pattern_type: SecretType::ApiKey,
            },
            // Slack tokens
            PatternEntry {
                name: "slack_token".into(),
                regex: r"xoxb-[0-9A-Za-z\-]{50,}".into(),
                pattern_type: SecretType::ApiKey,
            },
            // Generic password in config — full match includes key=value
            PatternEntry {
                name: "password_in_config".into(),
                regex: r#"(?i)(?:password|passwd|secret|token)\s*[=:]\s*["']?[^\s"']{8,}"#.into(),
                pattern_type: SecretType::Password,
            },
        ];

        // Add PII patterns only for Strict sensitivity
        if sensitivity == Sensitivity::Strict {
            entries.push(PatternEntry {
                name: "email".into(),
                regex: r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}".into(),
                pattern_type: SecretType::Pii,
            });
            entries.push(PatternEntry {
                name: "phone".into(),
                regex: r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b".into(),
                pattern_type: SecretType::Pii,
            });
            entries.push(PatternEntry {
                name: "ssn".into(),
                regex: r"\b\d{3}-\d{2}-\d{4}\b".into(),
                pattern_type: SecretType::Ssn,
            });
        }

        // For Relaxed, only keep private keys and high-confidence API keys
        let entries = if sensitivity == Sensitivity::Relaxed {
            entries
                .into_iter()
                .filter(|e| {
                    matches!(
                        e.pattern_type,
                        SecretType::PrivateKey | SecretType::ApiKey
                    )
                })
                .collect()
        } else {
            entries
        };

        let patterns = entries
            .into_iter()
            .filter_map(|e| {
                Regex::new(&e.regex).ok().map(|r| CompiledPattern {
                    regex: r,
                    pattern_type: e.pattern_type,
                })
            })
            .collect();

        Self {
            patterns,
            sensitivity,
        }
    }

    pub fn add_pattern(&mut self, entry: PatternEntry) -> Result<(), regex::Error> {
        let compiled = Regex::new(&entry.regex)?;
        self.patterns.push(CompiledPattern {
            regex: compiled,
            pattern_type: entry.pattern_type,
        });
        Ok(())
    }

    /// Scan text and return all matches, deduplicating overlapping ranges.
    /// When two matches overlap, the one from the earlier-registered pattern wins
    /// (lower pattern index = higher priority).
    pub fn scan(&self, text: &str) -> Vec<PatternMatch> {
        // Collect all raw matches tagged with their pattern index (priority)
        let mut raw: Vec<(usize, PatternMatch)> = Vec::new();
        for (idx, pattern) in self.patterns.iter().enumerate() {
            for m in pattern.regex.find_iter(text) {
                raw.push((
                    idx,
                    PatternMatch {
                        pattern_type: pattern.pattern_type.clone(),
                        matched_text: m.as_str().to_string(),
                        start: m.start(),
                        end: m.end(),
                    },
                ));
            }
        }

        // Sort by pattern priority (lower index first), then by start position
        raw.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.start.cmp(&b.1.start)));

        // Greedy selection: earlier-registered patterns claim their range first
        let mut accepted: Vec<PatternMatch> = Vec::new();
        for (_, candidate) in raw {
            let overlaps = accepted.iter().any(|m| {
                candidate.start < m.end && candidate.end > m.start
            });
            if !overlaps {
                accepted.push(candidate);
            }
        }

        // Return matches sorted by position for caller convenience
        accepted.sort_by_key(|m| m.start);
        accepted
    }

    /// Redact all detected secrets in text.
    pub fn redact(&self, text: &str) -> String {
        let mut result = text.to_string();
        // Process matches in reverse order to preserve byte indices
        let mut matches = self.scan(text);
        matches.sort_by(|a, b| b.start.cmp(&a.start));

        for m in matches {
            let hash = short_hash(&m.matched_text);
            let type_label = match &m.pattern_type {
                SecretType::PrivateKey => "private_key",
                SecretType::ApiKey => "api_key",
                SecretType::Password => "password",
                SecretType::CreditCard => "credit_card",
                SecretType::Ssn => "ssn",
                SecretType::Pii => "pii",
                SecretType::Custom(name) => name.as_str(),
            };
            let replacement = format!("[REDACTED:{type_label}:sha256:{hash}]");
            result.replace_range(m.start..m.end, &replacement);
        }
        result
    }

    pub fn sensitivity(&self) -> Sensitivity {
        self.sensitivity
    }
}

fn short_hash(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    hex::encode(&result[..8])
}
