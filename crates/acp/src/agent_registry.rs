/// Descriptor for a known coding agent that can be spawned via ACP.
#[derive(Debug, Clone)]
pub struct CodingAgentDescriptor {
    pub id: &'static str,
    pub display_name: &'static str,
    pub binary_name: &'static str,
    pub install_command: &'static str,
    /// CLI flag that puts the agent into ACP stdio mode.
    pub acp_flag: &'static str,
    pub slash_command: &'static str,
}

/// All coding agents supported by Rush Dino ACP.
pub fn known_agents() -> &'static [CodingAgentDescriptor] {
    &[
        CodingAgentDescriptor {
            id: "claude",
            display_name: "Claude Code",
            binary_name: "claude",
            install_command: "npm install -g @anthropic-ai/claude-code",
            acp_flag: "--acp",
            slash_command: "/claude",
        },
        CodingAgentDescriptor {
            id: "codex",
            display_name: "OpenAI Codex CLI",
            binary_name: "codex",
            install_command: "npm install -g @openai/codex",
            acp_flag: "--acp",
            slash_command: "/codex",
        },
        CodingAgentDescriptor {
            id: "gemini",
            display_name: "Gemini CLI",
            binary_name: "gemini",
            install_command: "npm install -g @google/gemini-cli",
            acp_flag: "--acp",
            slash_command: "/gemini",
        },
    ]
}
