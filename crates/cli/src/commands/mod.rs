pub mod approval;
pub mod kanban;
pub mod workflow;
pub mod agent;
pub mod agents;
pub mod browser;
pub mod config;
pub mod configure;
pub mod dashboard;
pub mod doctor;
pub mod downgrade;
pub mod health;
pub mod init;
pub mod memory;
pub mod message;
pub mod release_updater;
pub mod reset;
pub mod sessions;
pub mod start;
pub mod status;
pub mod stop;
pub mod uninstall;
pub mod upgrade;

pub fn rewrite_value(mut doc: String, key: &str, value: &str) -> String {
    let quoted = format!("{key} = \"{value}\"");
    for line in doc.lines() {
        if line.trim_start().starts_with(&format!("{key} =")) {
            doc = doc.replace(line, &quoted);
            break;
        }
    }
    doc
}

pub fn rewrite_active_provider(doc: String, provider: &str) -> String {
    rewrite_value(doc, "active_provider", provider)
}
