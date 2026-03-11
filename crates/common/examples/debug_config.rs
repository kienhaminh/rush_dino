use rushdino_common::{AppConfig, CredentialsConfig};

fn main() {
    let home = std::path::PathBuf::from(std::env::var("HOME").unwrap()).join(".rushdino");
    let config_path = home.join("config.toml");
    let creds_path = home.join("credentials.toml");

    println!("Checking config at: {:?}", config_path);
    match AppConfig::load_from_path(&config_path) {
        Ok(_) => println!("AppConfig loaded OK"),
        Err(e) => println!("AppConfig load FAILED: {:?}", e),
    }

    println!("Checking credentials at: {:?}", creds_path);
    match CredentialsConfig::load_from_path(&creds_path) {
        Ok(_) => println!("CredentialsConfig loaded OK"),
        Err(e) => println!("CredentialsConfig load FAILED: {:?}", e),
    }
}
