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
    /// Create a new workflow definition
    Create {
        #[arg(long)]
        name: String,
        #[arg(long)]
        steps: String,
        #[arg(long)]
        json: bool,
    },
    /// Delete a workflow
    Delete { id: String },
    /// List runs for a workflow
    Runs {
        id: String,
        #[arg(long, default_value = "20")]
        limit: u32,
        #[arg(long)]
        json: bool,
    },
    /// Get status of a specific workflow run
    RunStatus {
        id: String,
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(args: WorkflowArgs) -> Result<()> {
    let client = ApiClient::try_new().map_err(|e| {
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
        WorkflowAction::Create { name, steps, json } => {
            let steps_value: serde_json::Value = serde_json::from_str(&steps).map_err(|e| {
                rushdino_common::AppError::Validation(format!("invalid steps JSON: {e}"))
            })?;
            let data = client
                .post(
                    "/api/workflows",
                    serde_json::json!({ "name": name, "steps": steps_value }),
                )
                .await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let id = data["id"].as_str().unwrap_or("-");
                println!("{} Workflow created: {}", "✔".green(), id.bold());
            }
        }
        WorkflowAction::Delete { id } => {
            client.delete(&format!("/api/workflows/{id}")).await?;
            println!("{} Workflow {} deleted.", "✔".green(), id.bold());
        }
        WorkflowAction::Runs { id, limit, json } => {
            let data = client
                .get(&format!("/api/workflows/{id}/runs?limit={limit}"))
                .await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let items = data["items"].as_array().cloned().unwrap_or_default();
                println!("{} {}", "⚙️".bold(), "Workflow Runs".blue().bold());
                println!("{}", "========================================".dimmed());
                if items.is_empty() {
                    println!("{} No runs found.", "i".yellow());
                } else {
                    for item in &items {
                        let run_id = item["id"].as_str().unwrap_or("-");
                        let status = item["status"].as_str().unwrap_or("-");
                        let started = item["startedAt"].as_str().unwrap_or("-");
                        println!(
                            "  {} {} {}",
                            run_id.dimmed(),
                            format!("[{status}]").yellow(),
                            started.dimmed()
                        );
                    }
                    println!("\n{} {} runs", "✔".green(), items.len());
                }
            }
        }
        WorkflowAction::RunStatus { id, json } => {
            let data = client.get(&format!("/api/workflow-runs/{id}")).await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let status = data["status"].as_str().unwrap_or("-");
                let workflow_id = data["workflowId"].as_str().unwrap_or("-");
                let started = data["startedAt"].as_str().unwrap_or("-");
                println!(
                    "{} Run {} — {} — workflow: {} — started: {}",
                    "⚙️".bold(),
                    id.bold(),
                    format!("[{status}]").yellow(),
                    workflow_id.dimmed(),
                    started.dimmed()
                );
            }
        }
    }
    Ok(())
}
