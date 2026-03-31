// crates/cli/src/commands/doctor.rs
//
// `rushdino doctor [--json]` — aggregates data from four server endpoints
// and prints a structured diagnostic report about the running system.

use colored::Colorize;
use serde_json::{json, Value};

use rushdino_common::Result;

use crate::api_client::ApiClient;

#[derive(clap::Args, Debug)]
pub struct DoctorArgs {
    /// Output raw JSON instead of human-readable text
    #[arg(long)]
    pub json: bool,
}

pub async fn run(args: DoctorArgs) -> Result<()> {
    let client = match ApiClient::try_new() {
        Ok(c) => c,
        Err(_) => {
            println!(
                "{} Server not running — start with {}",
                "✖".red(),
                "rushdino start".bold()
            );
            return Ok(());
        }
    };

    // Fetch all data concurrently; ignore individual endpoint failures and show what we can.
    let doctor = client
        .get("/api/system/doctor")
        .await
        .unwrap_or(Value::Null);
    let summary = client
        .get("/api/system/summary")
        .await
        .unwrap_or(Value::Null);
    let gateway = client
        .get("/api/gateway/summary")
        .await
        .unwrap_or(Value::Null);

    // Fetch agent list then per-agent health; skip agents with no tasks.
    let agents_resp = client.get("/api/agents").await.unwrap_or(Value::Null);
    let agents = agents_resp["items"].as_array().cloned().unwrap_or_default();
    let mut agent_health: Vec<Value> = Vec::new();
    for agent in &agents {
        if let Some(id) = agent["id"].as_str() {
            let health = client
                .get(&format!("/api/agents/{id}/health"))
                .await
                .unwrap_or(Value::Null);
            let total = health["total_tasks"].as_i64().unwrap_or(0);
            if total > 0 {
                agent_health.push(json!({
                    "id": id,
                    "name": agent["name"].as_str().unwrap_or(id),
                    "emoji": agent["emoji"].as_str().unwrap_or("🤖"),
                    "success_rate": health["success_rate"].as_f64().unwrap_or(0.0),
                    "total_tasks": total,
                    "circuit_open": health["circuit_open"].as_bool().unwrap_or(false),
                }));
            }
        }
    }

    let findings = doctor.as_array().cloned().unwrap_or_default();
    let incidents = summary["incidents"].as_array().cloned().unwrap_or_default();
    let recent_failures = gateway["recent_failures"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let pending_count = summary["approvals"]["pending_count"]
        .as_i64()
        .unwrap_or(0);

    if args.json {
        println!(
            "{}",
            json!({
                "findings": findings,
                "incidents": incidents,
                "gateway_failures": recent_failures,
                "agent_health": agent_health,
                "pending_approvals": pending_count,
            })
        );
        return Ok(());
    }

    print_report(&findings, &incidents, &recent_failures, &agent_health, pending_count);
    Ok(())
}

/// Renders the human-readable doctor report to stdout.
fn print_report(
    findings: &[Value],
    incidents: &[Value],
    recent_failures: &[Value],
    agent_health: &[Value],
    pending_count: i64,
) {
    println!("{} {}", "🩺".bold(), "RushDino Doctor".blue().bold());
    println!("{}", "========================================".dimmed());

    print_system_diagnostics(findings);
    print_recent_incidents(incidents);
    print_gateway_failures(recent_failures);
    print_agent_health(agent_health);

    if pending_count > 0 {
        println!(
            "\n{} {}",
            "Pending Approvals:".bold(),
            pending_count.to_string().yellow()
        );
    }

    print_summary(findings, recent_failures, agent_health);
}

/// Prints the "System Diagnostics" section.
/// Always shown — falls back to a "no issues" line when findings is empty.
fn print_system_diagnostics(findings: &[Value]) {
    println!("\n{}", "System Diagnostics".bold());
    if findings.is_empty() {
        println!("  {} No issues detected.", "✔".green());
        return;
    }

    for f in findings {
        let severity = f["severity"].as_str().unwrap_or("info");
        let title = f["title"].as_str().unwrap_or("-");
        let detail = f["detail"].as_str().unwrap_or("");
        let action = f["action"].as_str().unwrap_or("");

        let (icon, label) = severity_icon_and_label(severity);
        println!("  {} {} {}", icon, label, title.bold());
        if !detail.is_empty() {
            println!("      {}", detail.dimmed());
        }
        if !action.is_empty() {
            println!("      {}", format!("Fix: {action}").yellow());
        }
    }
}

/// Prints up to 5 recent incidents. Section is skipped when empty.
fn print_recent_incidents(incidents: &[Value]) {
    let shown: Vec<_> = incidents.iter().take(5).collect();
    if shown.is_empty() {
        return;
    }

    println!("\n{}", "Recent Incidents".bold());
    for inc in shown {
        let level = inc["level"].as_str().unwrap_or("info");
        let target = inc["target"].as_str().unwrap_or("-");
        let message = inc["message"].as_str().unwrap_or("-");
        let icon = if level == "error" {
            "✖".red()
        } else {
            "⚠".yellow()
        };
        println!(
            "  {} {} | {} | {}",
            icon,
            level.dimmed(),
            target.dimmed(),
            message
        );
    }
}

/// Prints up to 5 gateway failures. Section is skipped when empty.
fn print_gateway_failures(recent_failures: &[Value]) {
    let shown: Vec<_> = recent_failures.iter().take(5).collect();
    if shown.is_empty() {
        return;
    }

    println!("\n{}", "Gateway Failures".bold());
    for f in shown {
        let channel = f["channel_id"].as_str().unwrap_or("-");
        let kind = f["kind"].as_str().unwrap_or("-");
        let message = f["message"].as_str().unwrap_or("-");
        println!(
            "  {} {} | {} | {}",
            "✖".red(),
            channel.dimmed(),
            kind.dimmed(),
            message
        );
    }
}

/// Prints agent health rows. Section is skipped when empty (or all agents have zero tasks).
fn print_agent_health(agent_health: &[Value]) {
    if agent_health.is_empty() {
        return;
    }

    println!("\n{}", "Agent Health".bold());
    for a in agent_health {
        let emoji = a["emoji"].as_str().unwrap_or("🤖");
        let name = a["name"].as_str().unwrap_or("-");
        let rate = (a["success_rate"].as_f64().unwrap_or(0.0) * 100.0) as u64;
        let total = a["total_tasks"].as_i64().unwrap_or(0);
        let circuit_open = a["circuit_open"].as_bool().unwrap_or(false);

        if circuit_open {
            println!(
                "  {} {} {}  {}% success  {} tasks  {}",
                "⚡".yellow(),
                emoji,
                name.bold(),
                rate,
                total,
                "[circuit open]".red()
            );
        } else {
            println!(
                "  {} {} {}  {}% success  {} tasks",
                "✔".green(),
                emoji,
                name.bold(),
                rate,
                total
            );
        }
    }
}

/// Prints the final summary line and separator.
fn print_summary(findings: &[Value], recent_failures: &[Value], agent_health: &[Value]) {
    let error_count = findings
        .iter()
        .filter(|f| {
            matches!(
                f["severity"].as_str(),
                Some("error") | Some("warn")
            )
        })
        .count()
        + recent_failures.len()
        + agent_health
            .iter()
            .filter(|a| a["circuit_open"].as_bool().unwrap_or(false))
            .count();

    println!("\n{}", "========================================".dimmed());
    if error_count == 0 {
        println!("{} No issues found.", "✔".green());
    } else {
        println!("{} {} issues found.", "✖".red(), error_count);
    }
}

/// Returns the (icon, label) pair for a given severity string.
fn severity_icon_and_label(severity: &str) -> (colored::ColoredString, colored::ColoredString) {
    match severity {
        "error" => ("✖".red(), "[ERROR]".red()),
        "warn" => ("⚠".yellow(), "[WARN] ".yellow()),
        _ => ("✔".green(), "[INFO] ".green()),
    }
}
