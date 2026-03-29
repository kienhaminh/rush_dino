/// Glob matching for guardrail patterns.
/// Supports: exact match, `cmd *` (command with args), `prefix*`, `*suffix`, `prefix/**` (path prefix).
pub fn glob_match(pattern: &str, text: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    // Handle pipe patterns: "curl * | sh"
    if pattern.contains(" | ") && text.contains(" | ") {
        let pattern_parts: Vec<&str> = pattern.splitn(2, " | ").collect();
        let text_parts: Vec<&str> = text.splitn(2, " | ").collect();
        if pattern_parts.len() == 2 && text_parts.len() == 2 {
            return glob_match(pattern_parts[0].trim(), text_parts[0].trim())
                && glob_match(pattern_parts[1].trim(), text_parts[1].trim());
        }
    }
    // "prefix/**" or "prefix**" — path prefix match
    if let Some(prefix) = pattern.strip_suffix("/**") {
        return text.starts_with(prefix);
    }
    if let Some(prefix) = pattern.strip_suffix("**") {
        return text.starts_with(prefix);
    }
    // "prefix/*" — path with wildcard child
    if let Some(prefix) = pattern.strip_suffix("/*") {
        let prefix_with_slash = format!("{prefix}/");
        return text.starts_with(&prefix_with_slash) && !text[prefix_with_slash.len()..].contains('/');
    }
    // "cmd *" — command with arguments: text must equal cmd or start with "cmd "
    if let Some(prefix) = pattern.strip_suffix(" *") {
        return text == prefix || text.starts_with(&format!("{prefix} "));
    }
    // "prefix*" — simple prefix match
    if let Some(prefix) = pattern.strip_suffix('*') {
        return text.starts_with(prefix);
    }
    // "*suffix" — suffix match
    if let Some(suffix) = pattern.strip_prefix('*') {
        return text.ends_with(suffix);
    }
    pattern == text
}
