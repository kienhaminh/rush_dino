use std::{fs, path::PathBuf};

use chrono::{Days, Utc};

use rushdino_common::Result;

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

    pub fn load_context(&self) -> Result<String> {
        let mut sections = Vec::new();
        // Load identity files from ROOT
        for name in ["SOUL.md", "USER.md", "AGENTS.md", "TOOLS.md", "IDENTITY.md"] {
            let path = self.root.join(name);
            if path.exists() {
                sections.push(fs::read_to_string(path)?);
            }
        }

        // Load canonical MEMORY.md, falling back to the legacy nested path during migration.
        let memory_md = self.current_memory_path();
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

    fn legacy_memory_path(&self) -> PathBuf {
        self.root.join("memory").join("MEMORY.md")
    }

    fn current_memory_path(&self) -> PathBuf {
        let canonical = self.canonical_memory_path();
        if canonical.exists() {
            canonical
        } else {
            self.legacy_memory_path()
        }
    }

    fn resolve_named_path(&self, file_name: &str) -> PathBuf {
        let normalized = file_name.replace('\\', "/");
        let trimmed = normalized.trim_start_matches('/');
        if trimmed.eq_ignore_ascii_case("MEMORY.md")
            || trimmed.eq_ignore_ascii_case("memory/MEMORY.md")
        {
            return self.current_memory_path();
        }
        sanitize(self.root.clone(), trimmed)
    }
}

fn sanitize(base: PathBuf, file_name: &str) -> PathBuf {
    let safe = file_name.replace("..", "").replace('\\', "/");
    base.join(safe.trim_start_matches('/'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_root_memory_first() {
      let root = std::env::temp_dir().join(format!("rushdino-memory-{}", uuid::Uuid::new_v4()));
      fs::create_dir_all(root.join("memory")).expect("memory dir");
      fs::write(root.join("MEMORY.md"), "root memory").expect("root memory");
      fs::write(root.join("memory/MEMORY.md"), "legacy memory").expect("legacy memory");

      let manager = MemoryManager::new(root.clone());
      let content = manager.read_named("MEMORY.md").expect("read memory");
      assert_eq!(content, "root memory");

      let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn falls_back_to_legacy_memory_path() {
      let root = std::env::temp_dir().join(format!("rushdino-memory-{}", uuid::Uuid::new_v4()));
      fs::create_dir_all(root.join("memory")).expect("memory dir");
      fs::write(root.join("memory/MEMORY.md"), "legacy memory").expect("legacy memory");

      let manager = MemoryManager::new(root.clone());
      let content = manager.read_named("MEMORY.md").expect("read memory");
      assert_eq!(content, "legacy memory");

      let _ = fs::remove_dir_all(root);
    }
}
