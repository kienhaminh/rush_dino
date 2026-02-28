/// Bundled agent templates embedded at compile time.
/// These are written to `~/.rushdino/agents/` on first run via `ensure_rushdino_dir_at`.
pub const BUNDLED_AGENTS: &[(&str, &str)] = &[
    ("general-assistant",        include_str!("agents/general-assistant.toml")),
    ("code-reviewer",            include_str!("agents/code-reviewer.toml")),
    ("researcher",               include_str!("agents/researcher.toml")),
    ("writer",                   include_str!("agents/writer.toml")),
    ("planner",                  include_str!("agents/planner.toml")),
    ("data-analyst",             include_str!("agents/data-analyst.toml")),
    ("devops-engineer",          include_str!("agents/devops-engineer.toml")),
    ("software-engineer",        include_str!("agents/software-engineer.toml")),
    ("artist-designer",          include_str!("agents/artist-designer.toml")),
    ("content-creator",          include_str!("agents/content-creator.toml")),
    ("social-network-assistant", include_str!("agents/social-network-assistant.toml")),
    ("spawn-agent",              include_str!("agents/spawn-agent.toml")),
];
