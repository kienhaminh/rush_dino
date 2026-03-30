use clap::Subcommand;
use colored::Colorize;

use rushdino_common::Result;

use crate::api_client::ApiClient;

#[derive(clap::Args, Debug)]
pub struct WorkflowArgs {
    #[command(subcommand)]
    pub action: WorkflowAction,
}

#[derive(Subcommand, Debug)]
pub enum WorkflowAction {
    /// List all workflows
    List {
        #[arg(long)]
        json: bool,
    },
    /// Get details for a workflow
    Get {
        id: String,
        #[arg(long)]
        json: bool,
    },
    /// Start a workflow run
    Run {
        id: String,
        #[arg(long)]
        input: Option<String>,
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(args: WorkflowArgs) -> Result<()> {
    let client = ApiClient::new().map_err(|e| {
        eprintln!("{} Cannot connect: {e}", "✖".red());
        e
    })?;

    match args.action {
        WorkflowAction::List { json } => {
            let data = client.get("/api/workflows").await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let items = data["items"].as_array().cloned().unwrap_or_default();
                println!("{} {}", "⚙️".bold(), "Workflows".blue().bold());
                println!("{}", "========================================".dimmed());
                if items.is_empty() {
                    println!("{} No workflows found.", "i".yellow());
                } else {
                    for item in &items {
                        let id = item["id"].as_str().unwrap_or("-");
                        let name = item["name"].as_str().unwrap_or("-");
                        let status = item["status"].as_str().unwrap_or("-");
                        println!(
                            "  {} {} {}",
                            id.dimmed(),
                            name.bold(),
                            format!("[{status}]").yellow()
                        );
                    }
                    println!("\n{} {} workflows", "✔".green(), items.len());
                }
            }
        }
        WorkflowAction::Get { id, json } => {
            let data = client.get(&format!("/api/workflows/{id}")).await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let name = data["name"].as_str().unwrap_or("-");
                let status = data["status"].as_str().unwrap_or("-");
                let steps = data["steps"].as_array().map(|s| s.len()).unwrap_or(0);
                println!(
                    "{} {} {} — {} steps",
                    "⚙️".bold(),
                    name.bold(),
                    format!("[{status}]").yellow(),
                    steps
                );
            }
        }
        WorkflowAction::Run { id, input, json } => {
            let mut body = serde_json::json!({ "triggered_by": "cli" });
            if let Some(text) = input {
                body["input"] = serde_json::Value::String(text);
            }
            let body = body;
            let data = client
                .post(&format!("/api/workflows/{id}/runs"), body)
                .await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let run_id = data["id"].as_str().unwrap_or("-");
                println!("{} Workflow run started: {}", "✔".green(), run_id.bold());
            }
        }
    }
    Ok(())
}
