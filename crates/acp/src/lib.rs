pub mod agent_installer;
pub mod agent_registry;
pub mod coding_agent_manager;
pub mod intent_classifier;
pub mod protocol;
pub mod session_store;
pub mod stdio_bridge;

pub use coding_agent_manager::CodingAgentManager;
pub use intent_classifier::{classify_coding_intent, CodingIntentScore};
