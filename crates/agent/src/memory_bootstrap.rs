use std::path::{Component, Path, PathBuf};

use rushdino_common::{AppError, Result};

pub const DEFAULT_BOOTSTRAP_MAX_CHARS: usize = 20_000;
pub const DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS: usize = 150_000;
const BOOTSTRAP_HEAD_RATIO: f64 = 0.7;
const BOOTSTRAP_TAIL_RATIO: f64 = 0.2;

/// A bootstrap file with its name, resolved path, and content (`None` = missing).
pub struct BootstrapFile {
    pub name: String,
    pub path: PathBuf,
    pub content: Option<String>,
}

/// A bootstrap file ready for injection into the system prompt.
pub struct BootstrapContextFile {
    /// Markdown heading label, e.g. "SOUL.md" or "Daily note (2024-01-15)".
    pub label: String,
    /// Content to inject (may be truncated, or a missing-file marker).
    pub content: String,
    /// Whether the content was truncated due to a per-file or total budget limit.
    pub truncated: bool,
    /// Original content length in bytes before truncation (0 if file is missing).
    pub original_len: usize,
}

/// Resolve `file_name` relative to `base`, rejecting any path that would escape `base`.
/// Returns `Err` for `..` components or absolute inputs. Does not require the file to exist.
pub fn resolve_within_boundary(base: &Path, file_name: &str) -> Result<PathBuf> {
    let normalized = file_name.replace('\\', "/");
    let file_path = Path::new(normalized.as_str());

    if file_path.is_absolute() {
        return Err(AppError::Validation(format!(
            "bootstrap file path must be relative: {file_name}"
        )));
    }

    for component in file_path.components() {
        if matches!(component, Component::ParentDir) {
            return Err(AppError::Validation(format!(
                "bootstrap file path must not escape base directory: {file_name}"
            )));
        }
    }

    Ok(base.join(file_path))
}

/// Apply per-file and total character budgets, producing injection-ready entries.
/// Missing files produce a `[MISSING]` marker entry instead of being silently skipped.
pub fn build_bootstrap_context(
    files: Vec<BootstrapFile>,
    max_chars_per_file: usize,
    max_total_chars: usize,
) -> Vec<BootstrapContextFile> {
    let mut result = Vec::new();
    let mut total_chars = 0usize;

    for file in files {
        let (content, truncated, original_len) = match file.content {
            None => (format!("[MISSING: {} not found]", file.name), false, 0),
            Some(raw) => {
                let original_len = raw.len();
                if total_chars >= max_total_chars {
                    let msg = format!(
                        "[TRUNCATED: total bootstrap budget exhausted, read {} for full content]",
                        file.name
                    );
                    (msg, true, original_len)
                } else {
                    let remaining = max_total_chars - total_chars;
                    let effective_max = max_chars_per_file.min(remaining);
                    let injected = truncate_bootstrap_content(&raw, &file.name, effective_max);
                    let was_truncated = injected.len() < original_len;
                    (injected, was_truncated, original_len)
                }
            }
        };

        total_chars += content.len();
        result.push(BootstrapContextFile {
            label: file.name,
            content,
            truncated,
            original_len,
        });
    }

    result
}

/// Build truncation warning lines matching OpenClaw's format:
/// `SOUL.md: 45000 raw -> 20000 injected (~55% removed; max/file).`
/// Returns an empty vec if nothing was truncated.
pub fn build_truncation_warning_lines(files: &[BootstrapContextFile]) -> Vec<String> {
    let truncated: Vec<&BootstrapContextFile> = files.iter().filter(|f| f.truncated).collect();
    if truncated.is_empty() {
        return Vec::new();
    }

    let mut lines: Vec<String> = truncated
        .iter()
        .map(|f| {
            let injected = f.content.len();
            let pct = if f.original_len > 0 {
                ((f.original_len - injected) * 100) / f.original_len
            } else {
                0
            };
            format!(
                "{}: {} raw -> {} injected (~{}% removed).",
                f.label, f.original_len, injected, pct
            )
        })
        .collect();

    lines.push(
        "If unintentional, raise bootstrap.max_chars_per_file and/or bootstrap.max_total_chars in config.toml.".to_owned(),
    );
    lines
}

/// Truncate `content` to `max_chars`, keeping 70% head + 20% tail with a marker in between.
/// Returns the content unchanged if it fits within `max_chars`.
pub fn truncate_bootstrap_content(content: &str, name: &str, max_chars: usize) -> String {
    if content.len() <= max_chars {
        return content.to_owned();
    }

    let head_chars = (max_chars as f64 * BOOTSTRAP_HEAD_RATIO) as usize;
    let tail_chars = (max_chars as f64 * BOOTSTRAP_TAIL_RATIO) as usize;

    let head_end = clamp_to_char_boundary(content, head_chars);
    let tail_start_raw = content.len().saturating_sub(tail_chars);
    let tail_start = clamp_to_char_boundary(content, tail_start_raw);

    let head = &content[..head_end];
    let tail = &content[tail_start..];

    format!("{head}\n\n[...truncated, read {name} for full content...]\n\n{tail}")
}

pub fn clamp_to_char_boundary(s: &str, mut index: usize) -> usize {
    if index >= s.len() {
        return s.len();
    }
    while !s.is_char_boundary(index) {
        index -= 1;
    }
    index
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_rejects_parent_dir() {
        let base = PathBuf::from("/tmp/rushdino");
        assert!(resolve_within_boundary(&base, "../etc/passwd").is_err());
        assert!(resolve_within_boundary(&base, "subdir/../../etc/passwd").is_err());
    }

    #[test]
    fn resolve_rejects_backslash_parent_dir() {
        let base = PathBuf::from("/tmp/rushdino");
        assert!(resolve_within_boundary(&base, "..\\windows\\system32").is_err());
    }

    #[test]
    fn resolve_rejects_absolute_path() {
        let base = PathBuf::from("/tmp/rushdino");
        assert!(resolve_within_boundary(&base, "/etc/passwd").is_err());
    }

    #[test]
    fn resolve_allows_normal_filename() {
        let base = PathBuf::from("/tmp/rushdino");
        let result = resolve_within_boundary(&base, "SOUL.md").unwrap();
        assert_eq!(result, base.join("SOUL.md"));
    }

    #[test]
    fn resolve_allows_subdirectory() {
        let base = PathBuf::from("/tmp/rushdino");
        let result = resolve_within_boundary(&base, "memory/daily/2024-01-15.md").unwrap();
        assert_eq!(result, base.join("memory/daily/2024-01-15.md"));
    }

    #[test]
    fn truncate_short_content_unchanged() {
        let content = "hello world";
        assert_eq!(truncate_bootstrap_content(content, "test.md", 100), content);
    }

    #[test]
    fn truncate_long_content_has_marker() {
        let content = "a".repeat(1000);
        let result = truncate_bootstrap_content(&content, "test.md", 100);
        assert!(result.contains("[...truncated, read test.md for full content...]"));
    }

    #[test]
    fn truncate_preserves_utf8_boundaries() {
        let content = "🎉".repeat(100); // 400 bytes
        let result = truncate_bootstrap_content(&content, "test.md", 50);
        assert!(std::str::from_utf8(result.as_bytes()).is_ok());
    }

    #[test]
    fn build_bootstrap_context_missing_file_marker() {
        let files = vec![BootstrapFile {
            name: "SOUL.md".to_owned(),
            path: PathBuf::from("/tmp/SOUL.md"),
            content: None,
        }];
        let ctx = build_bootstrap_context(files, 20_000, 150_000);
        assert_eq!(ctx.len(), 1);
        assert!(ctx[0].content.contains("[MISSING:"));
        assert!(!ctx[0].truncated);
        assert_eq!(ctx[0].original_len, 0);
    }

    #[test]
    fn build_bootstrap_context_tracks_truncation() {
        let files = vec![BootstrapFile {
            name: "BIG.md".to_owned(),
            path: PathBuf::from("/tmp/BIG.md"),
            content: Some("x".repeat(1000)),
        }];
        let ctx = build_bootstrap_context(files, 100, 150_000);
        assert!(ctx[0].truncated);
        assert_eq!(ctx[0].original_len, 1000);
        assert!(ctx[0].content.len() < 1000);
    }

    #[test]
    fn build_bootstrap_context_respects_total_budget() {
        let files = vec![
            BootstrapFile {
                name: "file1.md".to_owned(),
                path: PathBuf::from("/tmp/file1.md"),
                content: Some("x".repeat(100)),
            },
            BootstrapFile {
                name: "file2.md".to_owned(),
                path: PathBuf::from("/tmp/file2.md"),
                content: Some("y".repeat(100)),
            },
        ];
        let ctx = build_bootstrap_context(files, 20_000, 50);
        assert_eq!(ctx.len(), 2);
        assert!(ctx[1].truncated);
    }

    #[test]
    fn build_truncation_warning_lines_empty_when_no_truncation() {
        let files = vec![BootstrapContextFile {
            label: "SOUL.md".to_owned(),
            content: "hello".to_owned(),
            truncated: false,
            original_len: 5,
        }];
        assert!(build_truncation_warning_lines(&files).is_empty());
    }

    #[test]
    fn build_truncation_warning_lines_format() {
        let files = vec![BootstrapContextFile {
            label: "SOUL.md".to_owned(),
            content: "x".repeat(200),
            truncated: true,
            original_len: 1000,
        }];
        let lines = build_truncation_warning_lines(&files);
        assert!(!lines.is_empty());
        assert!(lines[0].contains("SOUL.md"));
        assert!(lines[0].contains("1000 raw"));
        assert!(lines[0].contains("200 injected"));
        assert!(lines[0].contains("80% removed"));
    }
}
