use std::collections::HashMap;

use super::types::*;

/// Hard rules that override trust levels. Deny rules always win.
pub struct PolicyEnforcer {
    deny_rules: HashMap<ActionCategory, Vec<String>>,
    allow_rules: HashMap<ActionCategory, Vec<String>>,
}

impl Default for PolicyEnforcer {
    fn default() -> Self {
        let mut deny_rules = HashMap::new();
        let mut allow_rules = HashMap::new();

        // Built-in always-deny rules
        deny_rules.insert(
            ActionCategory::Bash,
            vec![
                "sudo *".to_string(),
                "su *".to_string(),
                "rm -rf /".to_string(),
                "rm -rf ~".to_string(),
                "chmod 777".to_string(),
                "curl * | sh".to_string(),
                "curl * | bash".to_string(),
                "wget * | sh".to_string(),
                "wget * | bash".to_string(),
                "shutdown".to_string(),
                "reboot".to_string(),
                "halt".to_string(),
            ],
        );
        deny_rules.insert(
            ActionCategory::FsWrite,
            vec![
                "~/.ssh/*".to_string(),
                "~/.gnupg/*".to_string(),
                "~/.aws/credentials".to_string(),
            ],
        );

        // Built-in always-allow rules
        allow_rules.insert(
            ActionCategory::Bash,
            vec![
                "ls".to_string(),
                "pwd".to_string(),
                "echo *".to_string(),
                "cat *".to_string(),
                "git status".to_string(),
                "git log".to_string(),
                "git log *".to_string(),
                "git diff".to_string(),
                "git diff *".to_string(),
            ],
        );

        Self {
            deny_rules,
            allow_rules,
        }
    }
}

impl PolicyEnforcer {
    /// Check an action against hard rules. Deny rules checked first.
    pub fn check(&self, action: &GuardrailAction) -> FilterDecision {
        // Check deny rules first — always takes priority
        if let Some(rules) = self.deny_rules.get(&action.category) {
            for rule in rules {
                if glob_match(rule, &action.description) {
                    return FilterDecision::Deny(format!(
                        "Blocked by policy: matches deny rule '{rule}'"
                    ));
                }
            }
        }

        // Check allow rules
        if let Some(rules) = self.allow_rules.get(&action.category) {
            for rule in rules {
                if glob_match(rule, &action.description) {
                    return FilterDecision::Allow;
                }
            }
        }

        // No hard rule matched — pass through (TrustGate already handled approval)
        FilterDecision::Allow
    }

    pub fn add_deny(&mut self, category: ActionCategory, pattern: String) {
        self.deny_rules.entry(category).or_default().push(pattern);
    }

    pub fn add_allow(&mut self, category: ActionCategory, pattern: String) {
        self.allow_rules.entry(category).or_default().push(pattern);
    }

    pub fn deny_rules(&self) -> &HashMap<ActionCategory, Vec<String>> {
        &self.deny_rules
    }

    pub fn allow_rules(&self) -> &HashMap<ActionCategory, Vec<String>> {
        &self.allow_rules
    }
}

/// Glob matching for policy rules.
fn glob_match(pattern: &str, text: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    // Handle pipe patterns: "curl * | sh" — split on " | " and match each part
    if pattern.contains(" | ") && text.contains(" | ") {
        let pattern_parts: Vec<&str> = pattern.splitn(2, " | ").collect();
        let text_parts: Vec<&str> = text.splitn(2, " | ").collect();
        if pattern_parts.len() == 2 && text_parts.len() == 2 {
            return glob_match(pattern_parts[0].trim(), text_parts[0].trim())
                && glob_match(pattern_parts[1].trim(), text_parts[1].trim());
        }
    }
    // "prefix /**" or "prefix**" — path prefix match
    if let Some(prefix) = pattern.strip_suffix("/**") {
        return text.starts_with(prefix);
    }
    if let Some(prefix) = pattern.strip_suffix("**") {
        return text.starts_with(prefix);
    }
    // "prefix/*" — path with wildcard child
    if let Some(prefix) = pattern.strip_suffix("/*") {
        let prefix_with_slash = format!("{prefix}/");
        return text.starts_with(&prefix_with_slash) && !text[prefix_with_slash.len()..].contains('/');
    }
    // "cmd *" — command with arguments
    if let Some(prefix) = pattern.strip_suffix(" *") {
        return text == prefix || text.starts_with(&format!("{prefix} "));
    }
    // "prefix*" — simple prefix
    if let Some(prefix) = pattern.strip_suffix('*') {
        return text.starts_with(prefix);
    }
    // "*suffix"
    if let Some(suffix) = pattern.strip_prefix('*') {
        return text.ends_with(suffix);
    }
    pattern == text
}
