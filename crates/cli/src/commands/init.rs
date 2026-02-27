use dialoguer::{Input, Password, Select};

use rushdino_common::{init, Result};

pub fn run() -> Result<()> {
    let home = init::ensure_rushdino_dir()?;

    let options = ["Ollama", "OpenAI", "Anthropic", "Skip"];
    let selection = Select::new()
        .with_prompt("Choose provider")
        .items(&options)
        .default(0)
        .interact()
        .unwrap_or(0);

    let mut config = std::fs::read_to_string(home.join("config.toml"))?;
    let mut credentials = std::fs::read_to_string(home.join("credentials.toml"))?;

    match options[selection] {
        "Ollama" => {
            let base_url: String = Input::new()
                .with_prompt("Ollama base URL")
                .default("http://localhost:11434/v1".to_owned())
                .interact_text()
                .unwrap_or_else(|_| "http://localhost:11434/v1".to_owned());
            let model: String = Input::new()
                .with_prompt("Ollama model")
                .default("llama3.2:latest".to_owned())
                .interact_text()
                .unwrap_or_else(|_| "llama3.2:latest".to_owned());

            config = config.replace("active_provider = \"openai\"", "active_provider = \"ollama\"");
            config = config.replace("active_provider = \"anthropic\"", "active_provider = \"ollama\"");
            config = rewrite_value(config, "base_url", &base_url);
            config = rewrite_value(config, "model", &model);
        }
        "OpenAI" => {
            let key = Password::new()
                .with_prompt("OPENAI_API_KEY")
                .allow_empty_password(true)
                .interact()
                .unwrap_or_default();
            config = config.replace("active_provider = \"ollama\"", "active_provider = \"openai\"");
            credentials = rewrite_value(credentials, "openai_api_key", &key);
        }
        "Anthropic" => {
            let key = Password::new()
                .with_prompt("ANTHROPIC_API_KEY")
                .allow_empty_password(true)
                .interact()
                .unwrap_or_default();
            config = config.replace("active_provider = \"ollama\"", "active_provider = \"anthropic\"");
            credentials = rewrite_value(credentials, "anthropic_api_key", &key);
        }
        _ => {}
    }

    let brave: String = Password::new()
        .with_prompt("BRAVE_API_KEY (optional)")
        .allow_empty_password(true)
        .interact()
        .unwrap_or_default();
    if !brave.is_empty() {
        credentials = rewrite_value(credentials, "brave_api_key", &brave);
    }

    std::fs::write(home.join("config.toml"), config)?;
    std::fs::write(home.join("credentials.toml"), credentials)?;

    println!("Initialized at {}", home.display());
    println!("Next: rushdino start");
    Ok(())
}

fn rewrite_value(mut doc: String, key: &str, value: &str) -> String {
    let quoted = format!("{key} = \"{value}\"");
    for line in doc.lines() {
        if line.trim_start().starts_with(&format!("{key} =")) {
            doc = doc.replace(line, &quoted);
            break;
        }
    }
    doc
}
