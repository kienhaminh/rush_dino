use colored::Colorize;

use rushdino_common::Result;

pub async fn run() -> Result<()> {
    let manager = crate::service::detect()?;
    manager.stop()?;
    println!("{}", "Stopped RushDino".green());
    Ok(())
}
