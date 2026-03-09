pub const AGENTS_MD: &str = include_str!("../../../docs/references/templates/AGENTS.md");
pub const BOOT_MD: &str = include_str!("../../../docs/references/templates/BOOT.md");
pub const BOOTSTRAP_MD: &str = include_str!("../../../docs/references/templates/BOOTSTRAP.md");
pub const HEARTBEAT_MD: &str = include_str!("../../../docs/references/templates/HEARTBEAT.md");
pub const IDENTITY_MD: &str = include_str!("../../../docs/references/templates/IDENTITY.md");
pub const SOUL_MD: &str = include_str!("../../../docs/references/templates/SOUL.md");
pub const TOOLS_MD: &str = include_str!("../../../docs/references/templates/TOOLS.md");
pub const USER_MD: &str = include_str!("../../../docs/references/templates/USER.md");
pub const CONFIG_TOML: &str = include_str!("../../../docs/references/templates/config.toml");
pub const CREDENTIALS_TOML: &str =
    include_str!("../../../docs/references/templates/credentials.toml");

/// Returns the template content, stripping YAML frontmatter if present.
pub fn get_template(content: &'static str) -> &'static str {
    strip_frontmatter(content)
}

fn strip_frontmatter(content: &'static str) -> &'static str {
    if content.starts_with("---") {
        if let Some(end) = content[3..].find("---") {
            let offset = 3 + end + 3;
            if offset <= content.len() {
                return content[offset..].trim_start();
            }
        }
    }
    content
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_frontmatter() {
        let content = "---\ntitle: test\n---\nHello world";
        assert_eq!(strip_frontmatter(content), "Hello world");

        let no_frontmatter = "Hello world";
        assert_eq!(strip_frontmatter(no_frontmatter), "Hello world");
    }
}
