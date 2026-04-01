use clap::Subcommand;
use colored::Colorize;
use serde_json::json;

use rushdino_common::Result;

use crate::api_client::ApiClient;

#[derive(clap::Args, Debug)]
pub struct ApprovalsArgs {
    #[command(subcommand)]
    pub action: ApprovalsAction,
}

#[derive(Subcommand, Debug)]
pub enum ApprovalsAction {
    /// List pending approvals
    List {
        #[arg(long)]
        json: bool,
    },
    /// Approve a pending request
    Approve {
        request_id: String,
        #[arg(long)]
        session: String,
        #[arg(long)]
        json: bool,
    },
    /// Deny a pending request
    Deny {
        request_id: String,
        #[arg(long)]
        session: String,
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(args: ApprovalsArgs) -> Result<()> {
    let client = ApiClient::try_new().map_err(|e| {
        eprintln!("{} Cannot connect: {e}", "✖".red());
        e
    })?;

    match args.action {
        ApprovalsAction::List { json } => {
            let data = client.get("/api/approvals").await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let pending = data["pending"].as_array().cloned().unwrap_or_default();
                println!("{} {}", "🔐".bold(), "Approvals".blue().bold());
                println!("{}", "========================================".dimmed());
                if pending.is_empty() {
                    println!("{} No pending approvals.", "i".yellow());
                } else {
                    println!("{} {} pending:", "⚠️".yellow(), pending.len());
                    for item in &pending {
                        let req_id = item["requestId"].as_str().unwrap_or("-");
                        let tool = item["tool"].as_str().unwrap_or("-");
                        let sess = item["sessionId"].as_str().unwrap_or("-");
                        println!(
                            "  {} tool={} session={}",
                            req_id.dimmed(),
                            tool.bold(),
                            sess.yellow()
                        );
                    }
                }
            }
        }
        ApprovalsAction::Approve {
            request_id,
            session,
            json,
        } => {
            let data = client
                .post(
                    &format!("/api/approval/{request_id}"),
                    json!({ "approved": true, "session_id": session }),
                )
                .await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                println!("{} Request {} approved.", "✔".green(), request_id.bold());
            }
        }
        ApprovalsAction::Deny {
            request_id,
            session,
            json,
        } => {
            let data = client
                .post(
                    &format!("/api/approval/{request_id}"),
                    json!({ "approved": false, "session_id": session }),
                )
                .await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                println!("{} Request {} denied.", "✔".red(), request_id.bold());
            }
        }
    }
    Ok(())
}
