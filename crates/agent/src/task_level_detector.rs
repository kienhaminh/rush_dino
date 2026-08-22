//! Classifies an incoming user request into one of three handling strategies.
//!
//! Real users speak in natural language, not in test-data keywords. This
//! classifier recognises intent patterns found in actual assistant conversations:
//!
//! | Strategy | When | Example |
//! |---|---|---|
//! | [`HandlingStrategy::ImmediateResponse`] | Knowledge, explanation, quick write | *"What does async/await do?"* |
//! | [`HandlingStrategy::InlineTool`] | One focused live-data or file lookup | *"What's the latest Rust version?"* |
//! | [`HandlingStrategy::PostToBoard`] | Multi-step, build, coordinate, research+write | *"Set up auth with JWT and refresh tokens"* |
//!
//! The classifier is intentionally rule-based so it is deterministic and
//! testable without an LLM.  The LLM always has the final say; this is a
//! pre-filter that biases its decision.

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// How the agent should handle a request.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HandlingStrategy {
    /// Answer immediately — knowledge, explanation, short creative task.
    ImmediateResponse,
    /// Call one focused tool (web search / file read) and reply in the same turn.
    InlineTool,
    /// Post an async task to the kanban board for a specialist agent.
    PostToBoard,
}

impl HandlingStrategy {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ImmediateResponse => "immediate_response",
            Self::InlineTool => "inline_tool",
            Self::PostToBoard => "post_to_board",
        }
    }
}

/// Output of [`detect_task_level`].
#[derive(Debug, Clone)]
pub struct TaskLevelDecision {
    /// Recommended handling strategy.
    pub strategy: HandlingStrategy,
    /// Maps to `KanbanTask.complexity_level`: 1 = simple, 2 = moderate, 3 = complex.
    pub complexity_level: u32,
    /// Human-readable explanation of why this strategy was chosen.
    pub reasoning: String,
}

// ---------------------------------------------------------------------------
// Signal tables
// ---------------------------------------------------------------------------

/// Question / explanation intent — agent can answer from training knowledge.
/// These are the phrases real users write when they just want information.
const KNOWLEDGE_SIGNALS: &[&str] = &[
    "what is ",
    "what are ",
    "what does ",
    "what do ",
    "what's the difference",
    "what's the best way",
    "how does ",
    "how do ",
    "how can i ",
    "how should i ",
    "why does ",
    "why is ",
    "why do ",
    "can you explain",
    "explain ",
    "tell me about",
    "what does this mean",
    "what does it mean",
    "give me an example",
    "show me an example",
    "is it possible",
    "is there a way",
    "when should i use",
    "when to use",
    "which is better",
    "which should i",
];

/// Live-data intent — needs one web search or file read, but reply stays in the same turn.
const LIVE_DATA_SIGNALS: &[&str] = &[
    "latest version",
    "current version",
    "newest version",
    "latest release",
    "recent release",
    "right now",
    "at the moment",
    "currently available",
    "today's",
    "this week",
    "what's the price",
    "how much does",
    "cost of",
    "search for",
    "look up",
    "find information about",
    "is there any news",
    "latest news",
    "recent news",
    "check my ",
    "read my ",
    "open my ",
    "look at my ",
    "read the file",
    "open the file",
    "check the file",
    "what version am i",
    "what version do i have",
    "any updates on",
    "status of",
];

/// Build / implement / multi-step intent — clearly requires more than one turn.
const COMPLEX_ACTION_SIGNALS: &[&str] = &[
    "set up ",
    "setup ",
    "implement ",
    "implement a ",
    "implement the ",
    "build ",
    "build a ",
    "build me ",
    "create a complete",
    "create the ",
    "create a full",
    "develop ",
    "develop a ",
    "design and implement",
    "design a ",
    "write a complete",
    "write a full",
    "write the whole",
    "write a report",
    "write a recommendation",
    "write a proposal",
    "write a plan",
    "add authentication",
    "add auth",
    "configure ",
    "deploy ",
    "migrate ",
    "refactor ",
    "audit ",
    "review all ",
    "review the entire",
    "review the whole",
    "test all ",
    "test the entire",
    "research and ",
    "research the ", // research + any follow-up is multi-step
    "compare and write",
    "compare pricing",
    "compare features",
    "help me build",
    "help me set up",
    "help me create",
    "help me implement",
    "help me write a complete",
    "i need a complete",
    "i need a full",
    "i need you to build",
    "i want to build",
    "i want to create",
    "i want to implement",
];

/// Scope amplifiers — push borderline cases toward PostToBoard.
const SCOPE_AMPLIFIERS: &[&str] = &[
    "entire ",
    "whole ",
    "all of ",
    "across all ",
    "end-to-end",
    "end to end",
    "comprehensive",
    "in-depth",
    "full stack",
    "fullstack",
    "multiple services",
    "multiple endpoints",
    "from scratch",
    "ground up",
    "production-ready",
    "production ready",
    "with tests",
    "including tests",
    "and tests",
    "and documentation",
    "with documentation",
    "and also ",
    "as well as ",
    "in addition to ",
    "step by step",
    "step-by-step",
];

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

fn hits(text: &str, signals: &[&str]) -> usize {
    signals.iter().filter(|s| text.contains(**s)).count()
}

/// Classify a user request into a [`TaskLevelDecision`].
///
/// The function is pure, allocation-minimal, and runs in O(n·k).
pub fn detect_task_level(request: &str) -> TaskLevelDecision {
    let lower = request.to_lowercase();

    let knowledge_score = hits(&lower, KNOWLEDGE_SIGNALS);
    let live_data_score = hits(&lower, LIVE_DATA_SIGNALS);
    let complex_score = hits(&lower, COMPLEX_ACTION_SIGNALS);
    let scope_score = hits(&lower, SCOPE_AMPLIFIERS);
    let word_count = lower.split_whitespace().count();

    // Long requests are almost always multi-step regardless of keywords.
    let long_request = word_count > 50;

    // ── PostToBoard ──────────────────────────────────────────────────────────
    // Any complex action signal is strong enough on its own.
    // Scope amplifiers can push a borderline live-data request to the board.
    if complex_score >= 1
        || (live_data_score >= 1 && scope_score >= 2)
        || scope_score >= 3
        || long_request
    {
        return TaskLevelDecision {
            strategy: HandlingStrategy::PostToBoard,
            complexity_level: 3,
            reasoning: format!(
                "complex_score={complex_score}, scope_score={scope_score}, \
                 live_data={live_data_score}, words={word_count}"
            ),
        };
    }

    // ── InlineTool ───────────────────────────────────────────────────────────
    // Live data with no complex action — one search / read is enough.
    if live_data_score >= 1 {
        return TaskLevelDecision {
            strategy: HandlingStrategy::InlineTool,
            complexity_level: 2,
            reasoning: format!("live_data_score={live_data_score}"),
        };
    }

    // ── ImmediateResponse ────────────────────────────────────────────────────
    if knowledge_score >= 1 {
        return TaskLevelDecision {
            strategy: HandlingStrategy::ImmediateResponse,
            complexity_level: 1,
            reasoning: format!("knowledge_score={knowledge_score}"),
        };
    }

    // Default: treat as inline — better to over-tool than to go silent.
    TaskLevelDecision {
        strategy: HandlingStrategy::InlineTool,
        complexity_level: 2,
        reasoning: "no strong signal; defaulting to inline tool".into(),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
#[path = "task_level_detector_tests.rs"]
mod tests;
