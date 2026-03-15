use colored::Colorize;

use rushdino_common::Result;

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
    Ok(())
}

pub async fn run_downgrade(version: String) -> Result<()> {
    let status = release_updater::downgrade(version)?;
    println!("{}", status.green());
    Ok(())
}
