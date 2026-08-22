use clap::Subcommand;
use colored::Colorize;
use serde_json::json;

use rushdino_common::Result;

use crate::api_client::ApiClient;

#[derive(clap::Args, Debug)]
pub struct SessionsArgs {
    #[command(subcommand)]
    pub action: SessionsAction,
}

#[derive(Subcommand, Debug)]
pub enum SessionsAction {
    /// List all sessions
    List {
        #[arg(long)]
        json: bool,
    },
    /// Create a new session
    Create {
        #[arg(long)]
        title: String,
        #[arg(long)]
        json: bool,
    },
    /// Get details for a session
    Get {
        id: String,
        #[arg(long)]
        json: bool,
    },
    /// Send a message to a session
    Message {
        id: String,
        message: String,
        #[arg(long)]
        json: bool,
    },
    /// Archive a session
    Archive { id: String },
    /// Delete a session
    Delete { id: String },
    /// Spawn an async run with an agent
    Spawn {
        #[arg(long)]
        agent: String,
        #[arg(long)]
        prompt: String,
        #[arg(long)]
        json: bool,
    },
    /// List runs for a session
    History {
        id: String,
        #[arg(long, default_value = "20")]
        limit: u32,
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(args: SessionsArgs) -> Result<()> {
    let client = ApiClient::try_new().map_err(|e| {
        eprintln!("{} Cannot connect: {e}", "✖".red());
        e
    })?;

    match args.action {
        SessionsAction::List { json } => {
            let data = client.get("/api/sessions").await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let items = data["items"].as_array().cloned().unwrap_or_default();
                println!("{} {}", "📋".bold(), "Sessions".blue().bold());
                println!("{}", "========================================".dimmed());
                if items.is_empty() {
                    println!("{} No sessions found.", "i".yellow());
                } else {
                    for item in &items {
                        let id = item["id"].as_str().unwrap_or("-");
                        let title = item["title"].as_str().unwrap_or("-");
                        let status = item["status"].as_str().unwrap_or("-");
                        println!(
                            "  {} {} {}",
                            id.dimmed(),
                            title.bold(),
                            format!("[{status}]").yellow()
                        );
                    }
                    println!("\n{} {} sessions", "✔".green(), items.len());
                }
            }
        }
        SessionsAction::Create { title, json } => {
            let data = client
                .post("/api/sessions", json!({ "title": title }))
                .await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let id = data["id"].as_str().unwrap_or("-");
                println!("{} Session created: {}", "✔".green(), id.bold());
            }
        }
        SessionsAction::Get { id, json } => {
            let data = client.get(&format!("/api/sessions/{id}")).await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let title = data["session"]["title"].as_str().unwrap_or("-");
                let status = data["session"]["status"].as_str().unwrap_or("-");
                let msg_count = data["session"]["messageCount"].as_u64().unwrap_or(0);
                println!(
                    "{} {} {} — {} messages",
                    "📄".bold(),
                    title.bold(),
                    format!("[{status}]").yellow(),
                    msg_count
                );
            }
        }
        SessionsAction::Message { id, message, json } => {
            let data = client
                .post(
                    &format!("/api/sessions/{id}/messages"),
                    json!({ "message": message }),
                )
                .await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let reply = data["reply"].as_str().unwrap_or("");
                println!("{} Reply: {}", "💬".bold(), reply);
            }
        }
        SessionsAction::Archive { id } => {
            client
                .post(&format!("/api/sessions/{id}/archive"), json!({}))
                .await?;
            println!("{} Session {} archived.", "✔".green(), id.bold());
        }
        SessionsAction::Delete { id } => {
            client.delete(&format!("/api/sessions/{id}")).await?;
            println!("{} Session {} deleted.", "✔".green(), id.bold());
        }
        SessionsAction::Spawn {
            agent,
            prompt,
            json,
        } => {
            let data = client
                .post(
                    "/api/runs",
                    serde_json::json!({ "agentId": agent, "input": prompt }),
                )
                .await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let run_id = data["id"].as_str().unwrap_or("-");
                let session_id = data["sessionId"].as_str().unwrap_or("-");
                println!(
                    "{} Run started: {} (session: {})",
                    "✔".green(),
                    run_id.bold(),
                    session_id.dimmed()
                );
            }
        }
        SessionsAction::History { id, limit, json } => {
            let data = client
                .get(&format!("/api/sessions/{id}/runs?limit={limit}"))
                .await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let items = data["items"].as_array().cloned().unwrap_or_default();
                println!("{} {}", "📜".bold(), "Session History".blue().bold());
                println!("{}", "========================================".dimmed());
                if items.is_empty() {
                    println!("{} No runs found.", "i".yellow());
                } else {
                    for item in &items {
                        let run_id = item["id"].as_str().unwrap_or("-");
                        let status = item["status"].as_str().unwrap_or("-");
                        let created = item["createdAt"].as_str().unwrap_or("-");
                        println!(
                            "  {} {} {}",
                            run_id.dimmed(),
                            format!("[{status}]").yellow(),
                            created.dimmed()
                        );
                    }
                    println!("\n{} {} runs", "✔".green(), items.len());
                }
            }
        }
    }
    Ok(())
}
