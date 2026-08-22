use clap::Subcommand;
use colored::Colorize;
use serde_json::json;

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
    /// Get details for a specific agent
    Get {
        id: String,
        #[arg(long)]
        json: bool,
    },
    /// Persist a new or edited teammate on this machine
    Create {
        #[arg(long)]
        name: String,
        #[arg(long)]
        description: String,
        #[arg(long)]
        prompt: Option<String>,
        #[arg(long)]
        icon: Option<String>,
        #[arg(long)]
        tools: Option<String>,
        #[arg(long)]
        data_capable: bool,
        #[arg(long)]
        json: bool,
    },
    /// Assign work to a named teammate
    Assign {
        id: String,
        #[arg(long)]
        message: String,
        #[arg(long)]
        json: bool,
    },
    /// Hand work from one teammate to another
    Handoff {
        #[arg(long)]
        from: String,
        #[arg(long)]
        to: String,
        #[arg(long)]
        message: String,
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(args: AgentsArgs) -> Result<()> {
    let client = ApiClient::try_new().map_err(|e| {
        eprintln!("{} Cannot connect: {e}", "✖".red());
        e
    })?;

    match args.action {
        AgentsAction::List { json } => {
            let data = client.get("/api/agents").await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let items = data["items"].as_array().cloned().unwrap_or_default();
                println!("{} {}", "🤖".bold(), "Agents".blue().bold());
                println!("{}", "========================================".dimmed());
                if items.is_empty() {
                    println!("{} No agents found.", "i".yellow());
                } else {
                    for item in &items {
                        let id = item["id"].as_str().unwrap_or("-");
                        let name = item["name"].as_str().unwrap_or("-");
                        let emoji = item["emoji"].as_str().unwrap_or("🤖");
                        let role = item["description"].as_str().unwrap_or("");
                        let data = if item["dataCapable"].as_bool().unwrap_or(false) {
                            " data"
                        } else {
                            ""
                        };
                        println!("  {} {} {}{}", emoji, name.bold(), id.dimmed(), data.cyan());
                        if !role.is_empty() {
                            println!("      {}", role.dimmed());
                        }
                    }
                    println!("\n{} {} agents", "✔".green(), items.len());
                }
            }
        }
        AgentsAction::Create {
            name,
            description,
            prompt,
            icon,
            tools,
            data_capable,
            json,
        } => {
            let mut body = json!({
                "name": name,
                "description": description,
                "dataCapable": data_capable,
            });
            if let Some(prompt) = prompt {
                body["systemPrompt"] = json!(prompt);
            }
            if let Some(icon) = icon {
                body["icon"] = json!(icon);
            }
            if let Some(tools) = tools {
                body["tools"] = json!(tools);
            }
            let data = client.post("/api/agents", body).await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let id = data["id"].as_str().unwrap_or(&name);
                println!("{} persisted teammate {}", "✔".green(), id.bold());
            }
        }
        AgentsAction::Assign { id, message, json } => {
            let data = client
                .post(
                    &format!("/api/agents/{id}/assign"),
                    json!({ "message": message }),
                )
                .await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let agent = data["agentId"].as_str().unwrap_or(&id);
                let assignment = data["assignmentId"].as_str().unwrap_or("-");
                println!(
                    "{} assigned to {} ({})",
                    "✔".green(),
                    agent.bold(),
                    assignment.dimmed()
                );
            }
        }
        AgentsAction::Handoff {
            from,
            to,
            message,
            json,
        } => {
            let data = client
                .post(
                    &format!("/api/agents/{from}/handoff"),
                    json!({ "to": to, "message": message }),
                )
                .await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let sender = data["from_agent"].as_str().unwrap_or(&from);
                let receiver = data["to_agent"].as_str().unwrap_or(&to);
                println!(
                    "{} handoff {} → {}",
                    "✔".green(),
                    sender.bold(),
                    receiver.bold()
                );
            }
        }
        AgentsAction::Get { id, json } => {
            let data = client.get(&format!("/api/agents/{id}/runtime")).await?;
            if json {
                println!("{}", serde_json::to_string(&data).unwrap_or_default());
            } else {
                let name = data["name"].as_str().unwrap_or("-");
                let emoji = data["emoji"].as_str().unwrap_or("🤖");
                let agent_id = data["id"].as_str().unwrap_or("-");
                println!("{} {}", "🤖".bold(), "Agent".blue().bold());
                println!("{}", "========================================".dimmed());
                println!("  {} {} {}", emoji, name.bold(), agent_id.dimmed());
            }
        }
    }
    Ok(())
}
