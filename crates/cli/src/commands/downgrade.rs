use rushdino_common::Result;

pub async fn run(_version: String) -> Result<()> {
    crate::commands::upgrade::run_downgrade(_version).await
}
