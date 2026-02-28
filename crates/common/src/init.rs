use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::error::Result;

pub fn default_home_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".rushdino")
}

pub fn ensure_rushdino_dir() -> Result<PathBuf> {
    let home = default_home_dir();
    ensure_rushdino_dir_at(&home)?;
    Ok(home)
}

pub fn ensure_rushdino_dir_at(home: &Path) -> Result<()> {
    fs::create_dir_all(home)?;
    for dir in [
        "documents",
        "plugins",
        "logs",
        "skills",
        "memory",
        "memory/daily",
    ] {
        fs::create_dir_all(home.join(dir))?;
    }

    write_if_missing(
        &home.join("config.toml"),
        default_config_template(home).as_bytes(),
    )?;
    write_if_missing(
        &home.join("credentials.toml"),
        default_credentials_template().as_bytes(),
    )?;
    secure_if_unix(&home.join("credentials.toml"))?;

    write_if_missing(&home.join("memory/SOUL.md"), b"# SOUL\n\nBe pragmatic, concise, and helpful.\n")?;
    write_if_missing(
        &home.join("memory/AGENT.md"),
        b"# AGENT\n\nFollow user intent first. Use tools responsibly.\n",
    )?;
    write_if_missing(
        &home.join("memory/TOOL.md"),
        b"# TOOL\n\nGenerated at runtime from registered tools.\n",
    )?;
    write_if_missing(&home.join("memory/MEMORY.md"), b"# MEMORY\n\n")?;

    Ok(())
}

fn write_if_missing(path: &Path, content: &[u8]) -> Result<()> {
    if !path.exists() {
        fs::write(path, content)?;
    }
    Ok(())
}

fn default_config_template(home: &Path) -> String {
    format!(
        "host = \"127.0.0.1\"\nport = 3000\nlog_level = \"info\"\nactive_provider = \"ollama\"\ndata_dir = \"{}\"\ndb_path = \"{}\"\nbrave_search_endpoint = \"https://api.search.brave.com/res/v1/web/search\"\nallowed_chat_ids = []\n\n[ollama]\nbase_url = \"http://localhost:11434/v1\"\nmodel = \"llama3.2:latest\"\n\n[openai]\nmodel = \"gpt-4.1-mini\"\n\n[anthropic]\nmodel = \"claude-3-5-sonnet-latest\"\n",
        home.display(),
        home.join("data.db").display()
    )
}

fn default_credentials_template() -> &'static str {
    "openai_api_key = \"\"\nanthropic_api_key = \"\"\nbrave_api_key = \"\"\ntelegram_bot_token = \"\"\ncodex_access_token = \"\"\ncodex_refresh_token = \"\"\ncodex_token_expires_at = 0\n"
}

#[cfg(unix)]
fn secure_if_unix(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn secure_if_unix(_path: &Path) -> Result<()> {
    Ok(())
}
