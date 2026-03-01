use colored::Colorize;
use dialoguer::{theme::ColorfulTheme, Input, Password, Select};

use rushdino_common::{init, Result};

use super::codex_login;
use super::{rewrite_active_provider, rewrite_int_value, rewrite_value};

/// Returns `None` if the user pressed Esc (abort), `Some(index)` otherwise.
fn select_opt(prompt: &str, items: &[&str], default: usize) -> Option<usize> {
    Select::with_theme(&ColorfulTheme::default())
        .with_prompt(prompt)
        .items(items)
        .default(default)
        .interact_opt()
        .unwrap_or(None)
}

pub async fn run() -> Result<()> {
    println!("\n{} {}", "🦕".bold(), "Initializing RushDino".blue().bold());
    println!("{}", "========================================".dimmed());
    println!(
        "  {} Press {} at any time to abort.\n",
        "ℹ".cyan(),
        "Esc".yellow()
    );

    println!("{}", "Step 1: System Check...".blue().bold());
    let home = init::ensure_rushdino_dir()?;
    println!("{} Created directories at {}", "✔".green(), home.display());

    println!("\n{}", "Step 2: AI Provider Configuration...".blue().bold());
    let provider_options = ["Ollama", "OpenAI", "Anthropic", "Skip"];
    let Some(provider_sel) = select_opt("Choose primary AI provider", &provider_options, 0) else {
        println!("\n{} Initialization aborted.", "✖".red());
        return Ok(());
    };

    let mut config = std::fs::read_to_string(home.join("config.toml"))?;
    let mut credentials = std::fs::read_to_string(home.join("credentials.toml"))?;

    match provider_options[provider_sel] {
        "Ollama" => {
            let base_url_opts = ["http://localhost:11434/v1 (default)", "Enter custom URL", "Skip"];
            let Some(url_sel) = select_opt("Ollama base URL", &base_url_opts, 0) else {
                println!("\n{} Initialization aborted.", "✖".red());
                return Ok(());
            };

            let base_url = match base_url_opts[url_sel] {
                "Enter custom URL" => {
                    let url: String = Input::with_theme(&ColorfulTheme::default())
                        .with_prompt("Ollama base URL")
                        .interact_text()
                        .unwrap_or_else(|_| "http://localhost:11434/v1".to_owned());
                    url
                }
                "Skip" => {
                    println!("{} Skipped Ollama URL configuration.", "i".yellow());
                    String::new()
                }
                _ => "http://localhost:11434/v1".to_owned(),
            };

            let model_opts = ["llama3.2:latest (default)", "Enter custom model", "Skip"];
            let Some(model_sel) = select_opt("Ollama model", &model_opts, 0) else {
                println!("\n{} Initialization aborted.", "✖".red());
                return Ok(());
            };

            let model = match model_opts[model_sel] {
                "Enter custom model" => {
                    let m: String = Input::with_theme(&ColorfulTheme::default())
                        .with_prompt("Ollama model")
                        .interact_text()
                        .unwrap_or_else(|_| "llama3.2:latest".to_owned());
                    m
                }
                "Skip" => {
                    println!("{} Skipped Ollama model configuration.", "i".yellow());
                    String::new()
                }
                _ => "llama3.2:latest".to_owned(),
            };

            config = rewrite_active_provider(config, "ollama");
            if !base_url.is_empty() {
                config = rewrite_value(config, "base_url", &base_url);
            }
            if !model.is_empty() {
                config = rewrite_value(config, "model", &model);
            }

            let display_model = if model.is_empty() { "llama3.2:latest".to_owned() } else { model };
            println!("{} Configured Ollama with model {display_model}", "✔".green());
        }
        "OpenAI" => {
            let auth_options = ["API key", "Codex OAuth", "Skip"];
            let Some(auth_sel) = select_opt("Choose OpenAI authentication method", &auth_options, 0) else {
                println!("\n{} Initialization aborted.", "✖".red());
                return Ok(());
            };

            match auth_options[auth_sel] {
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
                _ => {
                    println!("{} Skipped OpenAI configuration.", "i".yellow());
                }
            }
        }
        "Anthropic" => {
            let auth_options = ["API key", "Skip"];
            let Some(auth_sel) = select_opt("Choose Anthropic authentication method", &auth_options, 0) else {
                println!("\n{} Initialization aborted.", "✖".red());
                return Ok(());
            };

            match auth_options[auth_sel] {
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

    println!("\n{}", "Step 3: Search Configuration...".blue().bold());
    let search_options = ["Enter BRAVE_API_KEY", "Skip"];
    let Some(search_sel) = select_opt("Configure Brave Search (optional)", &search_options, 1) else {
        println!("\n{} Initialization aborted.", "✖".red());
        return Ok(());
    };

    if search_options[search_sel] == "Enter BRAVE_API_KEY" {
        let brave = Password::with_theme(&ColorfulTheme::default())
            .with_prompt("BRAVE_API_KEY")
            .allow_empty_password(true)
            .interact()
            .unwrap_or_default();
        if !brave.is_empty() {
            credentials = rewrite_value(credentials, "brave_api_key", &brave);
            println!("{} Configured Brave Search", "✔".green());
        } else {
            println!("{} Skipped Search Provider configuration.", "i".yellow());
        }
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
