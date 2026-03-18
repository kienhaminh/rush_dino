use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::error::Result;
use crate::templates::{self, get_template};

/// Returns the RushDino data directory. Default is always `~/.rushdino`.
/// Use `RUSHDINO_HOME` to override.
pub fn canonical_home_dir() -> PathBuf {
    if let Ok(home) = std::env::var("RUSHDINO_HOME") {
        return PathBuf::from(home);
    }
    dirs::home_dir()
        .or_else(|| std::env::var("HOME").ok().map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".rushdino")
}

pub fn canonical_data_dir(home: &Path) -> PathBuf {
    home.to_path_buf()
}

pub fn canonical_db_path(home: &Path) -> PathBuf {
    home.join("data.db")
}

pub fn default_home_dir() -> PathBuf {
    canonical_home_dir()
}

pub fn ensure_rushdino_dir() -> Result<PathBuf> {
    let home = canonical_home_dir();
    ensure_rushdino_dir_at(&home)?;
    Ok(home)
}

pub fn ensure_rushdino_dir_at(home: &Path) -> Result<()> {
    fs::create_dir_all(home)?;
    for dir in [
        "documents",
        "plugins",
        "logs",
        "workspaces",
        "skills",
        "memory",
        "memory/daily",
        "agents",
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

    // Default Identity Files (The Herculius Pack)

    write_if_missing(
        &home.join("SOUL.md"),
        get_template(templates::SOUL_MD).as_bytes(),
    )?;

    write_if_missing(
        &home.join("IDENTITY.md"),
        get_template(templates::IDENTITY_MD).as_bytes(),
    )?;

    write_if_missing(
        &home.join("USER.md"),
        get_template(templates::USER_MD).as_bytes(),
    )?;

    write_if_missing(
        &home.join("TOOLS.md"),
        get_template(templates::TOOLS_MD).as_bytes(),
    )?;

    write_if_missing(
        &home.join("AGENTS.md"),
        get_template(templates::AGENTS_MD).as_bytes(),
    )?;

    let identity_is_default = fs::read_to_string(home.join("IDENTITY.md"))
        .map(|c| c.trim() == get_template(templates::IDENTITY_MD).trim())
        .unwrap_or(true);
    if identity_is_default {
        write_if_missing(
            &home.join("BOOTSTRAP.md"),
            get_template(templates::BOOTSTRAP_MD).as_bytes(),
        )?;
    }

    write_if_missing(
        &home.join("HEARTBEAT.md"),
        get_template(templates::HEARTBEAT_MD).as_bytes(),
    )?;

    write_if_missing(
        &home.join("BOOT.md"),
        get_template(templates::BOOT_MD).as_bytes(),
    )?;

    ensure_memory_file(home)?;

    // NOTE: agent templates and skill files are no longer embedded at compile time.
    // They are downloaded from GitHub on first run via `asset_sync::seed_bundled_assets`.

    Ok(())
}

fn write_if_missing(path: &Path, content: &[u8]) -> Result<()> {
    if !path.exists() {
        fs::write(path, content)?;
    }
    Ok(())
}

fn ensure_memory_file(home: &Path) -> Result<()> {
    let canonical = home.join("MEMORY.md");
    if !canonical.exists() {
        fs::write(&canonical, b"# MEMORY\n\n")?;
    }
    Ok(())
}

fn default_config_template(home: &Path) -> String {
    templates::CONFIG_TOML
        .replace("{home_path}", &home.display().to_string())
        .replace("{db_path}", &home.join("data.db").display().to_string())
}

fn default_credentials_template() -> &'static str {
    templates::CREDENTIALS_TOML
}

#[cfg(unix)]
fn secure_if_unix(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}
