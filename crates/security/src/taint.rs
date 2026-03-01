/// Taint level for data flowing through the agent.
///
/// Propagation rule: when combining tainted values, use the maximum (highest) taint level.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Default)]
pub enum TaintLevel {
    /// Data originating entirely from trusted internal sources.
    #[default]
    Clean,
    /// Data supplied directly by the end user (chat message, document path, etc.).
    UserInput,
    /// Data that matches suspicious patterns (partial prompt-injection signal).
    Suspicious,
    /// Data confirmed as malicious (high-confidence prompt injection or policy violation).
    Malicious,
}

/// A string value annotated with a taint level.
#[derive(Clone, Debug)]
pub struct TaintedString {
    pub value: String,
    pub taint: TaintLevel,
}

impl TaintedString {
    pub fn clean(value: impl Into<String>) -> Self {
        Self { value: value.into(), taint: TaintLevel::Clean }
    }

    pub fn user_input(value: impl Into<String>) -> Self {
        Self { value: value.into(), taint: TaintLevel::UserInput }
    }

    /// Upgrade taint to at least the given level, returning a new `TaintedString`.
    pub fn with_taint(mut self, level: TaintLevel) -> Self {
        if level > self.taint {
            self.taint = level;
        }
        self
    }

    /// Combine taint from multiple sources, keeping the maximum.
    pub fn propagate_max<'a>(base: TaintLevel, sources: impl IntoIterator<Item = &'a TaintLevel>) -> TaintLevel {
        sources.into_iter().fold(base, |acc, t| if t > &acc { t.clone() } else { acc })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn taint_ordering() {
        assert!(TaintLevel::Clean < TaintLevel::UserInput);
        assert!(TaintLevel::UserInput < TaintLevel::Suspicious);
        assert!(TaintLevel::Suspicious < TaintLevel::Malicious);
    }

    #[test]
    fn propagate_max_keeps_highest() {
        let max = TaintedString::propagate_max(
            TaintLevel::Clean,
            &[TaintLevel::UserInput, TaintLevel::Suspicious, TaintLevel::Clean],
        );
        assert_eq!(max, TaintLevel::Suspicious);
    }
}
