use colored::Colorize;
use dialoguer::{theme::ColorfulTheme, Input, Password, Select};
use std::fs;

use rushdino_auth::{auth_options_for_provider, AuthMethod, AuthProviderId};
use rushdino_common::{init, AppError, Result};

use super::{rewrite_active_provider, rewrite_value, upsert_value};

/// Arguments for the `rushdino configure` command.
///
/// When any credential flag is provided the command skips interactive mode
/// and writes directly to `~/.rushdino/credentials.toml`.
#[derive(clap::Args, Debug)]
pub struct ConfigureArgs {
    /// Interactively configure a specific provider (e.g. openai, anthropic, ollama)
    #[arg(long)]
    pub login: Option<String>,

    /// OpenAI API key (non-interactive)
    #[arg(long)]
    pub openai_key: Option<String>,

    /// Anthropic API key (non-interactive)
    #[arg(long)]
    pub anthropic_key: Option<String>,

    /// Brave Search API key (non-interactive)
    #[arg(long)]
    pub brave_api_key: Option<String>,

    /// Google Gemini API key (non-interactive)
    #[arg(long)]
    pub gemini_key: Option<String>,

    /// Telegram bot token (non-interactive)
    #[arg(long)]
    pub telegram_token: Option<String>,

    /// Discord bot token (non-interactive)
    #[arg(long)]
    pub discord_token: Option<String>,
}

pub async fn run(args: ConfigureArgs) -> Result<()> {
    let home = init::ensure_rushdino_dir()?;
    let creds_path = home.join("credentials.toml");

    // Non-interactive mode: if any credential flag was supplied, write them and return.
    let has_flags = args.openai_key.is_some()
        || args.anthropic_key.is_some()
        || args.brave_api_key.is_some()
        || args.gemini_key.is_some()
        || args.telegram_token.is_some()
        || args.discord_token.is_some();

    if has_flags {
        let mut credentials = fs::read_to_string(&creds_path).unwrap_or_default();

        if let Some(key) = &args.openai_key {
            credentials = upsert_value(credentials, "openai_api_key", key);
        }
        if let Some(key) = &args.anthropic_key {
            credentials = upsert_value(credentials, "anthropic_api_key", key);
        }
        if let Some(key) = &args.brave_api_key {
            credentials = upsert_value(credentials, "brave_api_key", key);
        }
        if let Some(key) = &args.gemini_key {
            credentials = upsert_value(credentials, "gemini_api_key", key);
        }
        if let Some(token) = &args.telegram_token {
            credentials = upsert_value(credentials, "telegram_token", token);
        }
        if let Some(token) = &args.discord_token {
            credentials = upsert_value(credentials, "discord_token", token);
        }

        fs::write(&creds_path, credentials)?;
        println!("✔ Credentials saved.");
        return Ok(());
    }

    // Interactive mode — reproduce the original --login flow.
    let config_path = home.join("config.toml");
    let mut config = fs::read_to_string(&config_path).unwrap_or_default();
    let mut credentials = fs::read_to_string(&creds_path).unwrap_or_default();

    println!("\n{} {}", "🦕".bold(), "Configure RushDino".blue().bold());
    println!("{}", "========================================".dimmed());

    let provider = if let Some(p) = args.login {
        p.to_lowercase()
    } else {
        println!("{} No --login parameter provided.", "i".yellow());
        println!(
            "{} Example: rushdino configure --login openai",
            "i".yellow()
        );
        return Ok(());
    };

    println!(
        "\n{} Configuring {}...",
        "⚙️".bold(),
        provider.blue().bold()
    );

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

            let auth_options = auth_options_for_provider(AuthProviderId::OpenAI)
                .iter()
                .filter_map(|opt| match opt.method {
                    AuthMethod::ApiKey => Some("API key"),
                    _ => None,
                })
                .collect::<Vec<_>>();
            let auth_selection = Select::with_theme(&ColorfulTheme::default())
                .with_prompt("Choose OpenAI authentication method")
                .items(&auth_options)
                .default(0)
                .interact()
                .unwrap_or(0);

            if auth_options[auth_selection] == "API key" {
                let key = Password::with_theme(&ColorfulTheme::default())
                    .with_prompt("OPENAI_API_KEY")
                    .allow_empty_password(true)
                    .interact()
                    .unwrap_or_default();
                config = rewrite_active_provider(config, "openai");
                credentials = rewrite_value(credentials, "openai_api_key", &key);
                println!("{} Configured OpenAI via API key", "✔".green());
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
            return Err(AppError::Validation(format!(
                "Unsupported provider: {}",
                provider
            )));
        }
    }

    fs::write(&config_path, config)?;
    fs::write(&creds_path, credentials)?;

    println!("\n{}", "========================================".dimmed());
    println!(
        "{} {}",
        "🚀".bold(),
        "Configuration saved successfully!".green().bold()
    );
    println!(
        "{} Restart RushDino for changes to take effect.",
        "i".yellow()
    );

    Ok(())
}
