use colored::Colorize;
use dialoguer::{theme::ColorfulTheme, Input, Password, Select};
use std::fs;

use rushdino_common::{init, Result, AppError};
use rushdino_auth::{auth_options_for_provider, AuthMethod, AuthProviderId};

use super::codex_login;
use super::{rewrite_active_provider, rewrite_int_value, rewrite_value};

pub async fn run(login_provider: Option<String>) -> Result<()> {
    let home = init::ensure_rushdino_dir()?;
    let config_path = home.join("config.toml");
    let creds_path = home.join("credentials.toml");

    let mut config = fs::read_to_string(&config_path).unwrap_or_default();
    let mut credentials = fs::read_to_string(&creds_path).unwrap_or_default();

    println!("\n{} {}", "🦕".bold(), "Configure RushDino".blue().bold());
    println!("{}", "========================================".dimmed());

    let provider = if let Some(p) = login_provider {
        p.to_lowercase()
    } else {
        println!("{} {}", "i".yellow(), "No --login parameter provided.");
        println!("{} Example: rushdino configure --login openai", "i".yellow());
        return Ok(());
    };

    println!("\n{} Configuring {}...", "⚙️".bold(), provider.blue().bold());

    match provider.as_str() {
        "ollama" => {
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
        "openai" => {
            let is_headless = rushdino_auth::oauth_pkce::is_remote();
            if is_headless {
                println!(
                    "{} Detected headless or remote environment — using CLI-based authentication only.",
                    "i".yellow()
                );
            }

            let auth_options = auth_options_for_provider(AuthProviderId::Openai)
                .iter()
                .filter_map(|opt| match opt.method {
                    AuthMethod::ApiKey => Some("API key"),
                    AuthMethod::OAuthPkce if !is_headless => Some("Codex OAuth"),
                    _ => None,
                })
                .collect::<Vec<_>>();
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

                    config = rewrite_active_provider(config, "codex");
                    credentials = rewrite_value(credentials, "codex_access_token", &tokens.access_token);
                    credentials = rewrite_value(credentials, "codex_refresh_token", &tokens.refresh_token);
                    credentials = rewrite_int_value(credentials, "codex_token_expires_at", tokens.expires_at);

                    println!("{} Configured OpenAI via Codex OAuth", "✔".green());
                }
                _ => {}
            }
        }
        "anthropic" => {
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
                    return Ok(());
                }
            }
        }
        _ => {
            println!("{} Unsupported provider: {}", "✖".red(), provider);
            return Err(AppError::Validation(format!("Unsupported provider: {}", provider)));
        }
    }

    fs::write(&config_path, config)?;
    fs::write(&creds_path, credentials)?;

    println!("\n{}", "========================================".dimmed());
    println!("{} {}", "🚀".bold(), "Configuration saved successfully!".green().bold());
    println!("{} Restart RushDino for changes to take effect.", "i".yellow());
    
    Ok(())
}
