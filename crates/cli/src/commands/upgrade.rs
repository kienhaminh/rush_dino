use colored::Colorize;

use rushdino_common::{asset_sync, init, Result};

use crate::commands::release_updater::{self, ReleaseChannel};

pub async fn run(beta: bool, version: Option<String>) -> Result<()> {
    let channel = if beta {
        ReleaseChannel::Beta
    } else if version.is_some() {
        ReleaseChannel::Pinned
    } else {
        ReleaseChannel::Stable
    };

    let status = release_updater::upgrade(channel, version)?;
    println!("{}", status.green());

    // Re-sync bundled skills now that the binary version has changed.
    // Pristine skill files are updated; user-modified files are preserved.
    println!("{}", "Syncing bundled skills...".blue().bold());
    let home = init::canonical_home_dir();
    match asset_sync::sync_bundled_assets(&home).await {
        Ok(()) => println!("{} Bundled skills synced", "✔".green()),
        Err(e) => println!(
            "{} Skill sync failed (run `rushdino init` to retry): {e}",
            "⚠".yellow()
        ),
    }

    Ok(())
}

pub async fn run_downgrade(version: String) -> Result<()> {
    let status = release_updater::downgrade(version)?;
    println!("{}", status.green());
    Ok(())
}
