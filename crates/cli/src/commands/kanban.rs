use clap::Subcommand;
use colored::Colorize;

use rushdino_common::Result;

use crate::api_client::ApiClient;

#[derive(clap::Args, Debug)]
pub struct KanbanArgs {
    #[command(subcommand)]
    pub action: KanbanAction,
}

#[derive(Subcommand, Debug)]
pub enum KanbanAction {
    /// Show full kanban board with all columns
    Board {
        #[arg(long)]
        json: bool,
    },
    /// List kanban tasks with optional filters
    List {
        #[arg(long)]
        status: Option<String>,
        #[arg(long)]
        agent: Option<String>,
        #[arg(long)]
        json: bool,
    },
    /// Get a specific kanban task
    Get {
        id: String,
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(args: KanbanArgs) -> Result<()> {
    let client = ApiClient::new().map_err(|e| {
        eprintln!("{} Cannot connect: {e}", "✖".red());
        e
    })?;

    match args.action {
        KanbanAction::Board { json } => {
            let data = client.get("/api/kanban/board").await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                println!("{} {}", "🗂️".bold(), "Kanban Board".blue().bold());
                println!("{}", "========================================".dimmed());
                let stats = &data["stats"];
                let total = stats["total"].as_u64().unwrap_or(0);
                let in_progress = stats["inProgress"].as_u64().unwrap_or(0);
                let done = stats["done"].as_u64().unwrap_or(0);
                println!(
                    "  Total: {}  In progress: {}  Done: {}",
                    total,
                    in_progress.to_string().yellow(),
                    done.to_string().green()
                );
                let columns = &data["columns"];
                for col_name in &[
                    "backlog",
                    "claimed",
                    "inProgress",
                    "blocked",
                    "inReview",
                    "done",
                    "failed",
                ] {
                    if let Some(tasks) = columns[col_name].as_array() {
                        if !tasks.is_empty() {
                            println!("\n  {} ({})", col_name.to_uppercase().bold(), tasks.len());
                            for t in tasks {
                                let id = t["id"].as_str().unwrap_or("-");
                                let title = t["title"].as_str().unwrap_or("-");
                                println!("    {} {}", id.dimmed(), title);
                            }
                        }
                    }
                }
            }
        }
        KanbanAction::List { status, agent, json } => {
            let mut path = "/api/kanban/tasks".to_owned();
            let mut params: Vec<String> = Vec::new();
            if let Some(s) = &status {
                params.push(format!("status={s}"));
            }
            if let Some(a) = &agent {
                params.push(format!("agent={a}"));
            }
            if !params.is_empty() {
                path = format!("{}?{}", path, params.join("&"));
            }
            let data = client.get(&path).await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let items = data.as_array().cloned().unwrap_or_default();
                println!("{} {} Tasks", "📋".bold(), items.len());
                for t in &items {
                    let id = t["id"].as_str().unwrap_or("-");
                    let title = t["title"].as_str().unwrap_or("-");
                    let st = t["status"].as_str().unwrap_or("-");
                    println!(
                        "  {} {} {}",
                        id.dimmed(),
                        title.bold(),
                        format!("[{st}]").yellow()
                    );
                }
            }
        }
        KanbanAction::Get { id, json } => {
            let data = client.get(&format!("/api/kanban/tasks/{id}")).await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let title = data["title"].as_str().unwrap_or("-");
                let status = data["status"].as_str().unwrap_or("-");
                let agent = data["assignedTo"].as_str().unwrap_or("unassigned");
                println!(
                    "{} {} {}",
                    "📋".bold(),
                    title.bold(),
                    format!("[{status}]").yellow()
                );
                println!("  Agent: {}  ID: {}", agent, id.dimmed());
            }
        }
    }
    Ok(())
}
