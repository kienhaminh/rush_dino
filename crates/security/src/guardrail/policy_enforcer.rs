use std::collections::HashMap;

use super::glob::glob_match;
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
                "rm -rf ~*".to_string(),
                "chmod 777 *".to_string(),
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

