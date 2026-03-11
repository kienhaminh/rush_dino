pub mod agents;
pub mod config;
pub mod db;
pub mod error;
pub mod init;
pub mod models;
pub mod rich_content;
pub mod skills;
pub mod templates;
pub mod workflow_templates;

pub use config::{
    AppConfig, ChannelAccessConfig, CredentialsConfig, DmPolicy, ExecutionConfig, ProviderKind,
    ShellExecSandboxConfig,
};
pub use error::{AppError, Result};
pub use rich_content::{LinkTarget, RichContent, RichContentBlock, TextFormat};

#[cfg(test)]
mod tests;
