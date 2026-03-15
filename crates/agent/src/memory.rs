use std::{fs, path::PathBuf};

use chrono::{Days, Utc};

use rushdino_common::Result;

use crate::memory_bootstrap::{resolve_within_boundary, BootstrapFile};

#[derive(Clone)]
pub struct MemoryManager {
    root: PathBuf,
}

impl MemoryManager {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn root(&self) -> &PathBuf {
        &self.root
    }

    /// Returns the files the agent should have in context on every session start
    /// (SOUL.md, USER.md, TOOLS.md, IDENTITY.md, MEMORY.md, yesterday's daily note).
    /// Excludes BOOTSTRAP.md, which is handled separately by the system prompt builder.
    pub fn startup_context(&self) -> String {
        let mut sections = Vec::new();

        for name in ["SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"] {
            if let Ok(content) = self.read_named(name) {
                sections.push(format!("### {name}\n\n{content}"));
            }
        }

        if let Ok(memory) = self.read_named("MEMORY.md") {
            sections.push(format!("### MEMORY.md\n\n{memory}"));
        }

        // Yesterday's daily note for recent context.
        let yesterday = chrono::Utc::now()
            .date_naive()
            .checked_sub_days(chrono::Days::new(1))
            .unwrap_or_else(|| chrono::Utc::now().date_naive());
        let daily_path = self
            .root
            .join("memory")
            .join("daily")
            .join(format!("{yesterday}.md"));
        if let Ok(daily) = std::fs::read_to_string(daily_path) {
            sections.push(format!("### Daily note ({yesterday})\n\n{daily}"));
        }

        sections.join("\n\n")
    }

    pub fn load_context(&self) -> Result<String> {
        let mut sections = Vec::new();
        self.push_file_if_exists(&mut sections, "BOOTSTRAP.md")?;

        // Load identity files from ROOT (AGENTS.md is the system prompt — not loaded here)
        for name in ["SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"] {
            self.push_file_if_exists(&mut sections, name)?;
        }

        let memory_md = self.canonical_memory_path();
        if memory_md.exists() {
            sections.push(fs::read_to_string(memory_md)?);
        }

        // Load Daily
        let yesterday = Utc::now()
            .date_naive()
            .checked_sub_days(Days::new(1))
            .unwrap_or_else(|| Utc::now().date_naive());
        let daily = self
            .root
            .join("memory")
            .join("daily")
            .join(format!("{yesterday}.md"));
        if daily.exists() {
            sections.push(fs::read_to_string(daily)?);
        }

        Ok(sections.join("\n\n"))
    }

    pub fn read_named(&self, file_name: &str) -> Result<String> {
        let path = self.resolve_named_path(file_name);
        Ok(fs::read_to_string(path)?)
    }

    /// Delete a named soul file if it exists. Returns true if the file was deleted.
    pub fn delete_named(&self, file_name: &str) -> bool {
        let path = self.resolve_named_path(file_name);
        match fs::remove_file(&path) {
            Ok(()) => {
                tracing::info!(file = %path.display(), "deleted memory file");
                true
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
            Err(e) => {
                tracing::warn!(file = %path.display(), error = %e, "failed to delete memory file");
                false
            }
        }
    }

    /// Write content to any named soul file (e.g. SOUL.md, IDENTITY.md, USER.md).
    /// Parent directories are created automatically.
    pub fn write_named(&self, file_name: &str, content: &str) -> Result<PathBuf> {
        let path = self.resolve_named_path(file_name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, content)?;
        Ok(path)
    }

    /// Update IDENTITY.md to reflect the currently active agent.
    /// Silently skips on I/O errors so it never blocks the session.
    pub fn sync_agent_identity(&self, agent_name: &str, icon: Option<&str>, description: &str) {
        let content = format!(
            "# Active Agent\n\nname: {agent_name}\nicon: {icon}\ndescription: {description}\n",
            icon = icon.unwrap_or("🤖"),
        );
        if let Err(e) = self.write_named("IDENTITY.md", &content) {
            tracing::warn!(agent = %agent_name, error = %e, "failed to sync IDENTITY.md");
        }
    }

    pub fn write_memory(&self, content: &str, daily: bool) -> Result<PathBuf> {
        let path = if daily {
            let today = Utc::now().date_naive();
            self.root
                .join("memory")
                .join("daily")
                .join(format!("{today}.md"))
        } else {
            self.canonical_memory_path()
        };
        fs::write(&path, content)?;
        Ok(path)
    }

    fn canonical_memory_path(&self) -> PathBuf {
        self.root.join("MEMORY.md")
    }

    fn resolve_named_path(&self, file_name: &str) -> PathBuf {
        let normalized = file_name.replace('\\', "/");
        let trimmed = normalized.trim_start_matches('/');
        if trimmed.eq_ignore_ascii_case("MEMORY.md") {
            return self.canonical_memory_path();
        }
        // Use boundary-aware resolver; fall back to a safe join on error.
        resolve_within_boundary(&self.root, trimmed).unwrap_or_else(|_| self.root.join(trimmed))
    }

    /// Returns structured bootstrap file entries (name + path + content-or-missing)
    /// for the same files loaded by `startup_context()`.
    pub fn collect_startup_files(&self) -> Vec<BootstrapFile> {
        let mut files = Vec::new();

        for name in ["SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"] {
            let path = self.resolve_named_path(name);
            let content = fs::read_to_string(&path).ok();
            files.push(BootstrapFile {
                name: name.to_owned(),
                path,
                content,
            });
        }

        let memory_path = self.canonical_memory_path();
        let memory_content = fs::read_to_string(&memory_path).ok();
        files.push(BootstrapFile {
            name: "MEMORY.md".to_owned(),
            path: memory_path,
            content: memory_content,
        });

        // Yesterday's daily note for recent context.
        let yesterday = Utc::now()
            .date_naive()
            .checked_sub_days(Days::new(1))
            .unwrap_or_else(|| Utc::now().date_naive());
        let daily_path = self
            .root
            .join("memory")
            .join("daily")
            .join(format!("{yesterday}.md"));
        let daily_content = fs::read_to_string(&daily_path).ok();
        files.push(BootstrapFile {
            name: format!("Daily note ({yesterday})"),
            path: daily_path,
            content: daily_content,
        });

        files
    }

    fn push_file_if_exists(&self, sections: &mut Vec<String>, file_name: &str) -> Result<()> {
        let path = self.root.join(file_name);
        if path.exists() {
            sections.push(fs::read_to_string(path)?);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        std::env::temp_dir().join(format!("rushdino-memory-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn reads_root_memory() {
        let root = temp_root();
        fs::create_dir_all(&root).expect("root dir");
        fs::write(root.join("MEMORY.md"), "root memory").expect("root memory");

        let manager = MemoryManager::new(root.clone());
        let content = manager.read_named("MEMORY.md").expect("read memory");
        assert_eq!(content, "root memory");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn load_context_includes_bootstrap_when_present() {
        let root = temp_root();
        fs::create_dir_all(&root).expect("root dir");
        fs::write(root.join("BOOTSTRAP.md"), "# BOOTSTRAP\n\nWho am I?").expect("bootstrap file");
        fs::write(root.join("SOUL.md"), "# SOUL").expect("soul file");

        let manager = MemoryManager::new(root.clone());
        let content = manager.load_context().expect("load context");

        assert!(content.starts_with("# BOOTSTRAP"));
        assert!(content.contains("Who am I?"));
        assert!(content.contains("# SOUL"));

        let _ = fs::remove_dir_all(root);
    }
}
