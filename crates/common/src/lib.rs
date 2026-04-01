pub mod agents;
pub mod asset_sync;
pub mod config;
pub mod dashboard_auth;
pub mod db;
pub mod error;
pub mod init;
pub mod models;
pub mod rich_content;
pub mod skills;
pub mod templates;
pub mod cleanup_manifests;
pub mod release_check;

pub use config::{
    AppConfig, ChannelAccessConfig, CredentialsConfig, DmPolicy, ExecutionConfig, McpServerConfig,
    Provider, ShellExecSandboxConfig,
};
pub use error::{AppError, Result};
pub use rich_content::{LinkTarget, RichContent, RichContentBlock, TextFormat};

#[cfg(test)]
mod tests;
