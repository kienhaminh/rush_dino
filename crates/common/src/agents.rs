/// Names of bundled agent templates.
///
/// These are downloaded from GitHub on first run via `asset_sync::seed_bundled_assets`
/// and cached in `~/.rushdino/agents/<name>.md`.
/// The compile-time `include_str!` embedding has been removed to reduce binary size.
pub const AGENT_NAMES: &[&str] = &[
    "brainstormer",
    "code-simplifier",
    "general-assistant",
    "code-reviewer",
    "debugger",
    "docs-manager",
    "fullstack-developer",
    "git-manager",
    "journal-writer",
    "mcp-manager",
    "project-manager",
    "researcher",
    "tester",
    "ui-ux-designer",
    "writer",
    "planner",
    "data-analyst",
    "devops-engineer",
    "software-engineer",
    "artist-designer",
    "content-creator",
    "social-network-assistant",
    "spawn-agent",
    "workflow-generator",
];
