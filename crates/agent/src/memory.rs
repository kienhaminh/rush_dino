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
        
        // Load Tool Definitions (dynamic)
        let tool_path = self.root.join("memory").join("TOOL.md");
        if tool_path.exists() {
            sections.push(fs::read_to_string(tool_path)?);
        }

        // Load Memory from memory/
        let memory_md = self.root.join("memory").join("MEMORY.md");
        if memory_md.exists() {
            sections.push(fs::read_to_string(memory_md)?);
        }

        // Load Daily
        let yesterday = Utc::now()
            .date_naive()
            .checked_sub_days(Days::new(1))
            .unwrap_or_else(|| Utc::now().date_naive());
        let daily = self.root.join("memory").join("daily").join(format!("{yesterday}.md"));
        if daily.exists() {
            sections.push(fs::read_to_string(daily)?);
        }

        Ok(sections.join("\n\n"))
    }

    pub fn read_named(&self, file_name: &str) -> Result<String> {
        // Allow reading from root or memory/
        let path = sanitize(self.root.clone(), file_name);
        Ok(fs::read_to_string(path)?)
    }

    pub fn write_memory(&self, content: &str, daily: bool) -> Result<PathBuf> {
        let path = if daily {
            let today = Utc::now().date_naive();
            self.root.join("memory").join("daily").join(format!("{today}.md"))
        } else {
            self.root.join("memory").join("MEMORY.md")
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
        // Always write to memory/TOOL.md to keep root clean
        fs::write(self.root.join("memory").join("TOOL.md"), format!("# TOOL\n\n{lines}\n"))?;
        Ok(())
    }
}

fn sanitize(base: PathBuf, file_name: &str) -> PathBuf {
    let safe = file_name.replace("..", "").replace('\\', "/");
    base.join(safe.trim_start_matches('/'))
}
