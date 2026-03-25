/// Names of bundled agent templates.
///
/// These are downloaded from GitHub on first run via `asset_sync::seed_bundled_assets`
/// and cached in `~/.rushdino/agents/<name>.md`.
/// The compile-time `include_str!` embedding has been removed to reduce binary size.
pub const AGENT_NAMES: &[&str] = &[
    "code-simplifier",
    "code-reviewer",
    "data-analyst",
    "debugger",
    "designer",
    "devops-engineer",
    "docs-manager",
    "fullstack-developer",
    "planner",
    "researcher",
    "software-engineer",
    "tester",
    "workflow-generator",
    "writer",
];
