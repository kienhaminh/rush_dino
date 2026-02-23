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
        for name in ["SOUL.md", "AGENT.md", "MEMORY.md"] {
            let path = self.root.join(name);
            if path.exists() {
                sections.push(fs::read_to_string(path)?);
            }
        }

        let yesterday = Utc::now()
            .date_naive()
            .checked_sub_days(Days::new(1))
            .unwrap_or_else(|| Utc::now().date_naive());
        let daily = self.root.join("daily").join(format!("{yesterday}.md"));
        if daily.exists() {
            sections.push(fs::read_to_string(daily)?);
        }

        Ok(sections.join("\n\n"))
    }

    pub fn read_named(&self, file_name: &str) -> Result<String> {
        let path = sanitize(self.root.clone(), file_name);
        Ok(fs::read_to_string(path)?)
    }

    pub fn write_memory(&self, content: &str, daily: bool) -> Result<PathBuf> {
        let path = if daily {
            let today = Utc::now().date_naive();
            self.root.join("daily").join(format!("{today}.md"))
        } else {
            self.root.join("MEMORY.md")
        };
        fs::write(&path, content)?;
        Ok(path)
    }

    pub fn render_tool_doc(&self, names: &[String]) -> Result<()> {
        let lines = names
            .iter()
            .map(|name| format!("- {name}"))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(self.root.join("TOOL.md"), format!("# TOOL\n\n{lines}\n"))?;
        Ok(())
    }
}

fn sanitize(base: PathBuf, file_name: &str) -> PathBuf {
    let safe = file_name.replace("..", "").replace('\\', "/");
    base.join(safe.trim_start_matches('/'))
}
