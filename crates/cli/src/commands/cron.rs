use clap::Subcommand;
use colored::Colorize;
use serde_json::json;

use rushdino_common::Result;

use crate::api_client::ApiClient;

#[derive(clap::Args, Debug)]
pub struct CronArgs {
    #[command(subcommand)]
    pub action: CronAction,
}

#[derive(Subcommand, Debug)]
pub enum CronAction {
    /// List all cron jobs
    List {
        #[arg(long)]
        json: bool,
    },
    /// Get details and recent runs for a cron job
    Get {
        id: String,
        #[arg(long)]
        json: bool,
    },
    /// Create a new scheduled cron job
    Create {
        #[arg(long)]
        schedule: String,
        #[arg(long)]
        prompt: String,
        #[arg(long)]
        agent: Option<String>,
        #[arg(long)]
        json: bool,
    },
    /// Delete a cron job
    Delete { id: String },
    /// Pause a cron job
    Pause { id: String },
    /// Resume a paused cron job
    Resume { id: String },
    /// Manually trigger a cron job now
    Trigger {
        id: String,
        #[arg(long)]
        json: bool,
    },
    /// List run history for a cron job
    Runs {
        id: String,
        #[arg(long, default_value = "20")]
        limit: u32,
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(args: CronArgs) -> Result<()> {
    let client = ApiClient::try_new().map_err(|e| {
        eprintln!("{} Cannot connect: {e}", "✖".red());
        e
    })?;

    match args.action {
        CronAction::List { json } => {
            let data = client.get("/api/cron").await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let items = data["items"].as_array().cloned().unwrap_or_default();
                println!("{} {}", "⏰".bold(), "Cron Jobs".blue().bold());
                println!("{}", "========================================".dimmed());
                if items.is_empty() {
                    println!("{} No cron jobs found.", "i".yellow());
                } else {
                    for item in &items {
                        let id = item["id"].as_str().unwrap_or("-");
                        let name = item["name"].as_str().unwrap_or("-");
                        let expr = item["schedule"]["expr"]
                            .as_str()
                            .or_else(|| item["schedule"]["run_at"].as_str())
                            .unwrap_or("-");
                        let state = item["state"].as_str().unwrap_or("-");
                        println!(
                            "  {} {} {} {}",
                            id.dimmed(),
                            name.bold(),
                            expr.dimmed(),
                            format!("[{state}]").yellow()
                        );
                    }
                    println!("\n{} {} jobs", "✔".green(), items.len());
                }
            }
        }
        CronAction::Get { id, json } => {
            let data = client.get(&format!("/api/cron/{id}")).await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let job = &data["job"];
                let expr = job["schedule"]["expr"]
                    .as_str()
                    .or_else(|| job["schedule"]["run_at"].as_str())
                    .unwrap_or("-");
                let state = job["state"].as_str().unwrap_or("-");
                let message = job["target"]["message"].as_str().unwrap_or("-");
                println!("{} {}", "⏰".bold(), "Cron Job".blue().bold());
                println!("{}", "========================================".dimmed());
                println!("  Schedule: {}", expr.bold());
                println!("  State:    {}", format!("[{state}]").yellow());
                println!("  Message:  {}", message.dimmed());
                let runs = data["runs"].as_array().cloned().unwrap_or_default();
                if !runs.is_empty() {
                    println!("\n  Recent runs:");
                    for run in runs.iter().take(5) {
                        let run_id = run["id"].as_str().unwrap_or("-");
                        let run_status = run["status"].as_str().unwrap_or("-");
                        println!("    {} {}", run_id.dimmed(), format!("[{run_status}]").yellow());
                    }
                }
            }
        }
        CronAction::Create { schedule, prompt, agent, json } => {
            let name = prompt.chars().take(60).collect::<String>();
            let mut target = serde_json::json!({
                "kind": "agent_turn",
                "message": prompt,
            });
            if let Some(agent_id) = agent {
                target["agent_id"] = serde_json::Value::String(agent_id);
            }
            let body = serde_json::json!({
                "name": name,
                "schedule": { "kind": "cron", "expr": schedule },
                "target": target,
            });
            let data = client.post("/api/cron", body).await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let id = data["id"].as_str().unwrap_or("-");
                println!("{} Cron job created: {}", "✔".green(), id.bold());
            }
        }
        CronAction::Delete { id } => {
            client.delete(&format!("/api/cron/{id}")).await?;
            println!("{} Cron job {} deleted.", "✔".green(), id.bold());
        }
        CronAction::Pause { id } => {
            client.post(&format!("/api/cron/{id}/pause"), json!({})).await?;
            println!("{} Cron job {} paused.", "✔".green(), id.bold());
        }
        CronAction::Resume { id } => {
            client.post(&format!("/api/cron/{id}/resume"), json!({})).await?;
            println!("{} Cron job {} resumed.", "✔".green(), id.bold());
        }
        CronAction::Trigger { id, json } => {
            let data = client.post(&format!("/api/cron/{id}/run"), json!({})).await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let session_id = data["sessionId"].as_str().unwrap_or("-");
                println!(
                    "{} Cron job {} triggered. Session: {}",
                    "✔".green(),
                    id.bold(),
                    session_id.dimmed()
                );
            }
        }
        CronAction::Runs { id, limit, json } => {
            let data = client
                .get(&format!("/api/cron/{id}/runs?limit={limit}"))
                .await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let items = data["items"].as_array().cloned().unwrap_or_default();
                println!("{} {}", "📋".bold(), "Cron Runs".blue().bold());
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
    }
    Ok(())
}
