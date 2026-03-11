/// Bundled agent templates embedded at compile time.
/// These are written to `~/.rushdino/agents/` on first run via `ensure_rushdino_dir_at`.
pub const BUNDLED_AGENTS: &[(&str, &str)] = &[
    ("brainstormer", include_str!("agents/brainstormer.md")),
    (
        "code-simplifier",
        include_str!("agents/code-simplifier.md"),
    ),
    (
        "general-assistant",
        include_str!("agents/general-assistant.md"),
    ),
    ("code-reviewer", include_str!("agents/code-reviewer.md")),
    ("debugger", include_str!("agents/debugger.md")),
    ("docs-manager", include_str!("agents/docs-manager.md")),
    (
        "fullstack-developer",
        include_str!("agents/fullstack-developer.md"),
    ),
    ("git-manager", include_str!("agents/git-manager.md")),
    ("journal-writer", include_str!("agents/journal-writer.md")),
    ("mcp-manager", include_str!("agents/mcp-manager.md")),
    (
        "project-manager",
        include_str!("agents/project-manager.md"),
    ),
    ("researcher", include_str!("agents/researcher.md")),
    ("tester", include_str!("agents/tester.md")),
    ("ui-ux-designer", include_str!("agents/ui-ux-designer.md")),
    ("writer", include_str!("agents/writer.md")),
    ("planner", include_str!("agents/planner.md")),
    ("data-analyst", include_str!("agents/data-analyst.md")),
    (
        "devops-engineer",
        include_str!("agents/devops-engineer.md"),
    ),
    (
        "software-engineer",
        include_str!("agents/software-engineer.md"),
    ),
    (
        "artist-designer",
        include_str!("agents/artist-designer.md"),
    ),
    (
        "content-creator",
        include_str!("agents/content-creator.md"),
    ),
    (
        "social-network-assistant",
        include_str!("agents/social-network-assistant.md"),
    ),
    ("spawn-agent", include_str!("agents/spawn-agent.md")),
    (
        "workflow-generator",
        include_str!("agents/workflow-generator.md"),
    ),
];
