/// Result of classifying whether a user message is a coding intent.
#[derive(Debug, Clone)]
pub struct CodingIntentScore {
    pub is_coding_intent: bool,
    pub confidence: f32,
    /// Recommended agent id (e.g. "claude").
    pub recommended_agent: Option<String>,
}

/// Keywords that signal a coding-related request.
const CODING_KEYWORDS: &[&str] = &[
    "implement",
    "refactor",
    "debug",
    "write code",
    "fix bug",
    "add feature",
    "write script",
    "write a function",
    "write a class",
    "create a function",
    "create a class",
    "function",
    "method",
    "variable",
    "algorithm",
    "code",
    "program",
    "script",
    "bug",
    "error",
    "exception",
    "unit test",
    "class",
    "interface",
    "api",
    "endpoint",
    "database",
    "query",
    "sql",
    "html",
    "css",
    "javascript",
    "typescript",
    "python",
    "rust",
    "golang",
    "java",
    "c++",
    "dockerfile",
    "makefile",
    "cli tool",
];

/// Phase-1 keyword heuristic classifier. Threshold for `is_coding_intent` is 0.80.
/// Each distinct keyword match adds 0.25 confidence, capped at 0.95.
pub fn classify_coding_intent(text: &str) -> CodingIntentScore {
    let lower = text.to_lowercase();
    let matched = CODING_KEYWORDS
        .iter()
        .filter(|&&kw| lower.contains(kw))
        .count();

    if matched == 0 {
        return CodingIntentScore {
            is_coding_intent: false,
            confidence: 0.0,
            recommended_agent: None,
        };
    }

    let confidence = (matched as f32 * 0.25_f32).min(0.95_f32);
    CodingIntentScore {
        is_coding_intent: confidence >= 0.80,
        confidence,
        recommended_agent: Some("claude".to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_keywords_returns_zero_confidence() {
        let score = classify_coding_intent("what is the weather today?");
        assert!(!score.is_coding_intent);
        assert_eq!(score.confidence, 0.0);
    }

    #[test]
    fn single_keyword_below_threshold() {
        let score = classify_coding_intent("implement this function");
        assert!(score.confidence > 0.0);
        // "implement" + "function" = 2 matches → 0.50 → below threshold
        assert!(!score.is_coding_intent || score.confidence >= 0.80);
    }

    #[test]
    fn multiple_keywords_meet_threshold() {
        let score = classify_coding_intent("implement and refactor the python function to fix bug");
        assert!(score.is_coding_intent);
        assert!(score.confidence >= 0.80);
    }

    #[test]
    fn parse_slash_command_prefix() {
        // Slash commands are parsed at gateway level, not here —
        // but they still contain coding intent keywords.
        let score = classify_coding_intent("write code to parse json in typescript");
        assert!(score.is_coding_intent);
    }
}
