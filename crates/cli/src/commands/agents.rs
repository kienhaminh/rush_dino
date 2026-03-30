use clap::Subcommand;
use colored::Colorize;

use rushdino_common::Result;

use crate::api_client::ApiClient;

#[derive(clap::Args, Debug)]
pub struct AgentsArgs {
    #[command(subcommand)]
    pub action: AgentsAction,
}

#[derive(Subcommand, Debug)]
pub enum AgentsAction {
    /// List all agents
    List {
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(args: AgentsArgs) -> Result<()> {
    let client = ApiClient::new().map_err(|e| {
        eprintln!("{} Cannot connect: {e}", "✖".red());
        e
    })?;

    match args.action {
        AgentsAction::List { json } => {
            let data = client.get("/api/agents").await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let items = data.as_array().cloned().unwrap_or_default();
                println!("{} {}", "🤖".bold(), "Agents".blue().bold());
                println!("{}", "========================================".dimmed());
                if items.is_empty() {
                    println!("{} No agents found.", "i".yellow());
                } else {
                    for item in &items {
                        let id = item["id"].as_str().unwrap_or("-");
                        let name = item["name"].as_str().unwrap_or("-");
                        let emoji = item["emoji"].as_str().unwrap_or("🤖");
                        println!("  {} {} {}", emoji, name.bold(), id.dimmed());
                    }
                    println!("\n{} {} agents", "✔".green(), items.len());
                }
            }
        }
    }
    Ok(())
}
