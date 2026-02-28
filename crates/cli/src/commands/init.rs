use colored::Colorize;
use dialoguer::{theme::ColorfulTheme, Input, Password, Select};

use rushdino_common::{init, Result};

use super::codex_login;
use super::{rewrite_active_provider, rewrite_int_value, rewrite_value};

pub async fn run() -> Result<()> {
    println!("\n{} {}", "🦕".bold(), "Initializing RushDino".blue().bold());
    println!("{}", "========================================".dimmed());

    println!("\n{}", "Step 1: System Check...".blue().bold());
    let home = init::ensure_rushdino_dir()?;
    println!("{} Created directories at {}", "✔".green(), home.display());

    println!("\n{}", "Step 2: AI Provider Configuration...".blue().bold());
    let options = ["Ollama", "OpenAI", "Anthropic", "Skip"];
    let selection = Select::with_theme(&ColorfulTheme::default())
        .with_prompt("Choose primary AI provider")
        .items(&options)
        .default(0)
        .interact()
        .unwrap_or(0);

    let mut config = std::fs::read_to_string(home.join("config.toml"))?;
    let mut credentials = std::fs::read_to_string(home.join("credentials.toml"))?;

    match options[selection] {
        "Ollama" => {
            let base_url: String = Input::with_theme(&ColorfulTheme::default())
                .with_prompt("Ollama base URL")
                .default("http://localhost:11434/v1".to_owned())
                .interact_text()
                .unwrap_or_else(|_| "http://localhost:11434/v1".to_owned());
            let model: String = Input::with_theme(&ColorfulTheme::default())
                .with_prompt("Ollama model")
                .default("llama3.2:latest".to_owned())
                .interact_text()
                .unwrap_or_else(|_| "llama3.2:latest".to_owned());

            config = rewrite_active_provider(config, "ollama");
            config = rewrite_value(config, "base_url", &base_url);
            config = rewrite_value(config, "model", &model);
            
            println!("{} Configured Ollama with model {model}", "✔".green());
        }
        "OpenAI" => {
            let auth_options = ["API key", "Codex OAuth"];
            let auth_selection = Select::with_theme(&ColorfulTheme::default())
                .with_prompt("Choose OpenAI authentication method")
                .items(&auth_options)
                .default(0)
                .interact()
                .unwrap_or(0);

            match auth_options[auth_selection] {
                "API key" => {
                    let key = Password::with_theme(&ColorfulTheme::default())
                        .with_prompt("OPENAI_API_KEY")
                        .allow_empty_password(true)
                        .interact()
                        .unwrap_or_default();
                    config = rewrite_active_provider(config, "openai");
                    credentials = rewrite_value(credentials, "openai_api_key", &key);
                    println!("{} Configured OpenAI via API key", "✔".green());
                }
                "Codex OAuth" => {
                    println!("{} Opening browser to authenticate with OpenAI Codex...", "⏳".yellow());
                    let tokens = codex_login::run()
                        .await
                        .map_err(|e| {
                            eprintln!("{} Codex OAuth failed: {e}", "✖".red());
                            e
                        })?;

                    // Codex OAuth is an OpenAI auth path, but the runtime provider remains `codex`.
                    config = rewrite_active_provider(config, "codex");
                    credentials = rewrite_value(credentials, "codex_access_token", &tokens.access_token);
                    credentials = rewrite_value(credentials, "codex_refresh_token", &tokens.refresh_token);
                    credentials = rewrite_int_value(credentials, "codex_token_expires_at", tokens.expires_at);

                    println!("{} Configured OpenAI via Codex OAuth", "✔".green());
                }
                _ => {}
            }
        }
        "Anthropic" => {
            let auth_options = ["API key", "Skip"];
            let auth_selection = Select::with_theme(&ColorfulTheme::default())
                .with_prompt("Choose Anthropic authentication method")
                .items(&auth_options)
                .default(0)
                .interact()
                .unwrap_or(0);

            match auth_options[auth_selection] {
                "API key" => {
                    let key = Password::with_theme(&ColorfulTheme::default())
                        .with_prompt("ANTHROPIC_API_KEY")
                        .allow_empty_password(true)
                        .interact()
                        .unwrap_or_default();
                    config = rewrite_active_provider(config, "anthropic");
                    credentials = rewrite_value(credentials, "anthropic_api_key", &key);
                    println!("{} Configured Anthropic via API key", "✔".green());
                }
                _ => {
                    println!("{} Skipped Anthropic authentication.", "i".yellow());
                }
            }
        }
        _ => {
            println!("{} Skipped AI provider configuration.", "i".yellow());
        }
    }

    println!("\n{}", "Step 3: Server Port...".blue().bold());
    let port: u16 = Input::with_theme(&ColorfulTheme::default())
        .with_prompt("Server port")
        .default(28847)
        .interact_text()
        .unwrap_or(28847);
    config = rewrite_int_value(config, "port", port as i64);
    println!("{} Server port set to {port}", "✔".green());

    println!("\n{}", "Step 4: Search Configuration...".blue().bold());
    let brave: String = Password::with_theme(&ColorfulTheme::default())
        .with_prompt("BRAVE_API_KEY (optional)")
        .allow_empty_password(true)
        .interact()
        .unwrap_or_default();
    if !brave.is_empty() {
        credentials = rewrite_value(credentials, "brave_api_key", &brave);
        println!("{} Configured Brave Search", "✔".green());
    } else {
        println!("{} Skipped Search Provider configuration.", "i".yellow());
    }

    std::fs::write(home.join("config.toml"), config)?;
    std::fs::write(home.join("credentials.toml"), credentials)?;

    println!("\n{}", "========================================".dimmed());
    println!("{} {}", "🚀".bold(), "RushDino successfully initialized!".green().bold());
    println!("{} Location: {}", "📂".bold(), home.display().to_string().blue());
    println!("\n{}", "Next steps:".bold());
    println!("  Run {} to start the daemon.", "rushdino start".yellow());
    Ok(())
}
