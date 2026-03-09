use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
};

use chrono::Utc;
use rushdino_common::{AppError, Result};

/// Manages per-agent task logs stored as Markdown files on disk.
///
/// Log files live at `{memory_root}/memory/agents/{agent_name}/tasks.md`.
/// Each entry records the task input and the agent's response, formatted in
/// Markdown so they can be read back as plain context by future invocations.
pub struct AgentTaskMemory {
    memory_root: PathBuf,
}

impl AgentTaskMemory {
    pub fn new(memory_root: PathBuf) -> Self {
        Self { memory_root }
    }

    /// Rejects agent names that could escape the memory directory.
    fn validate_name(name: &str) -> Result<()> {
        if name.is_empty()
            || name.contains('/')
            || name.contains('\\')
            || name.contains("..")
            || name.starts_with('.')
        {
            return Err(AppError::Validation(format!(
                "invalid agent name for task memory: {name:?}"
            )));
        }
        Ok(())
    }

    /// Returns the path to the task log file for a given agent name.
    ///
    /// Path: `{memory_root}/memory/agents/{agent_name}/tasks.md`
    pub fn task_log_path(&self, agent_name: &str) -> PathBuf {
        self.memory_root
            .join("memory")
            .join("agents")
            .join(agent_name)
            .join("tasks.md")
    }

    /// Appends one task entry to the agent's task log.
    ///
    /// Creates parent directories if they do not exist. Truncates task and
    /// outcome to 200 chars each to keep the log manageable. Best-effort:
    /// callers should log warnings on failure rather than propagating errors.
    pub fn append_task(&self, agent_name: &str, task: &str, outcome: &str) -> Result<()> {
        Self::validate_name(agent_name)?;

        let path = self.task_log_path(agent_name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let timestamp = Utc::now().to_rfc3339();
        let task_preview = truncate_str(task, 200);
        let outcome_preview = truncate_str(outcome, 200);

        let entry = format!(
            "## {timestamp}\n\n**Task**: {task_preview}\n**Outcome**: {outcome_preview}\n\n---\n\n"
        );

        let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
        file.write_all(entry.as_bytes())?;

        Ok(())
    }

    /// Returns the last 100 lines of the task log, or `None` if the file does not exist.
    pub fn load_task_log(&self, agent_name: &str) -> Option<String> {
        Self::validate_name(agent_name).ok()?;
        let path = self.task_log_path(agent_name);
        let content = fs::read_to_string(&path).ok()?;
        if content.is_empty() {
            return None;
        }

        // Return only the last 100 lines to avoid overwhelming context.
        let lines: Vec<&str> = content.lines().collect();
        let start = lines.len().saturating_sub(100);
        Some(lines[start..].join("\n"))
    }
}

/// Truncates a string to at most `max_chars` Unicode characters.
fn truncate_str(s: &str, max_chars: usize) -> &str {
    if s.chars().count() <= max_chars {
        return s;
    }
    // Walk char indices to find the byte boundary at max_chars chars.
    s.char_indices()
        .nth(max_chars)
        .map(|(byte_idx, _)| &s[..byte_idx])
        .unwrap_or(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(Uuid::new_v4().to_string())
    }

    #[test]
    fn append_and_load_round_trip() {
        let dir = temp_dir();
        let memory = AgentTaskMemory::new(dir.clone());

        memory
            .append_task("researcher", "find AI news", "here are the findings")
            .expect("append should succeed");

        let log = memory
            .load_task_log("researcher")
            .expect("log should exist");
        assert!(log.contains("find AI news"));
        assert!(log.contains("here are the findings"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_returns_none_for_missing_file() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let memory = AgentTaskMemory::new(dir.clone());

        assert!(memory.load_task_log("nonexistent").is_none());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_invalid_agent_name() {
        let dir = temp_dir();
        let memory = AgentTaskMemory::new(dir.clone());

        assert!(memory.append_task("../escape", "task", "outcome").is_err());
        assert!(memory.append_task("a/b", "task", "outcome").is_err());
        assert!(memory.append_task("", "task", "outcome").is_err());
    }

    #[test]
    fn task_log_path_is_correct() {
        let dir = PathBuf::from("/home/user");
        let memory = AgentTaskMemory::new(dir);

        let path = memory.task_log_path("researcher");
        assert_eq!(
            path,
            PathBuf::from("/home/user/memory/agents/researcher/tasks.md")
        );
    }

    #[test]
    fn load_returns_last_100_lines_when_large() {
        let dir = temp_dir();
        let memory = AgentTaskMemory::new(dir.clone());

        // Write more than 100 lines
        for i in 0..50 {
            memory
                .append_task("agent", &format!("task {i}"), &format!("outcome {i}"))
                .unwrap();
        }

        let log = memory.load_task_log("agent").expect("log should exist");
        let line_count = log.lines().count();
        assert!(line_count <= 100, "expected ≤100 lines, got {line_count}");

        let _ = fs::remove_dir_all(&dir);
    }
}
