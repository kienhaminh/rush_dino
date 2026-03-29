use std::{
    path::PathBuf,
    sync::{Arc, RwLock},
};

use rushdino_common::{models::Message, Result};
use rushdino_providers::types::ThinkingLevel;

use crate::{
    agent_manager::{AgentManager, AgentTemplate},
    memory::MemoryManager,
    skill_manager::Skill,
    tool_registry::{SessionToolContext, ToolRegistry},
};

impl crate::engine::AgentEngine {
    pub async fn list_conversations(&self) -> Result<Vec<rushdino_common::models::Conversation>> {
        self.conversation.list_conversations().await
    }

    pub async fn list_agent_conversations(&self) -> Result<Vec<rushdino_common::models::Conversation>> {
        self.conversation.list_agent_conversations().await
    }

    pub async fn list_usage_metrics(
        &self,
        start: Option<&str>,
        end: Option<&str>,
        provider: Option<&str>,
        model: Option<&str>,
        conversation_id: Option<&str>,
        limit: i64,
    ) -> Result<Vec<crate::usage_metrics_store::UsageMetricRow>> {
        self.usage_metrics
            .list_usage(start, end, provider, model, conversation_id, limit)
            .await
    }

    pub async fn latest_usage_metric(
        &self,
        conversation_id: &str,
    ) -> Result<Option<crate::usage_metrics_store::UsageMetricSnapshot>> {
        self.usage_metrics
            .latest_usage_for_conversation(conversation_id)
            .await
    }

    pub async fn get_conversation_messages(&self, id: &str) -> Result<Vec<Message>> {
        self.conversation.get_messages(id).await
    }

    pub async fn delete_conversation(&self, id: &str) -> Result<()> {
        self.conversation.delete_conversation(id).await
    }

    pub async fn create_session(
        &self,
        title: &str,
    ) -> Result<rushdino_common::models::Conversation> {
        self.conversation.create_conversation(title).await
    }

    /// Creates the main workspace session with the fixed ID `"main"` if it does
    /// not yet exist. Safe to call on every startup (uses INSERT OR IGNORE).
    pub async fn ensure_main_session(&self) -> Result<rushdino_common::models::Conversation> {
        self.conversation
            .create_conversation_with_id("main", "Main")
            .await
    }

    pub async fn get_session_record(
        &self,
        id: &str,
    ) -> Result<crate::conversation::ConversationRecord> {
        self.conversation.get_conversation_record(id).await
    }

    pub async fn archive_session(
        &self,
        id: &str,
    ) -> Result<crate::conversation::ConversationRecord> {
        self.conversation.archive_conversation(id).await
    }

    pub async fn reset_session(&self, id: &str) -> Result<()> {
        self.conversation.reset_conversation(id).await?;
        self.runtime.delete_session_runs(id).await
    }

    pub fn config(&self) -> &crate::engine::AgentConfig {
        &self.config
    }

    /// Effective thinking level: override if set, otherwise static config.
    pub fn effective_thinking_level(&self) -> ThinkingLevel {
        self.thinking_level_override
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            .unwrap_or_else(|| self.config.thinking_level.clone())
    }

    /// Expose the override Arc so it can be shared with RuntimeState.
    pub fn thinking_level_override_arc(&self) -> Arc<RwLock<Option<ThinkingLevel>>> {
        self.thinking_level_override.clone()
    }

    /// Replace the override Arc with an externally-managed shared one.
    /// Call immediately after construction to link the engine to RuntimeState.
    pub fn set_thinking_level_override_arc(&mut self, arc: Arc<RwLock<Option<ThinkingLevel>>>) {
        self.thinking_level_override = arc;
    }

    pub fn memory(&self) -> &MemoryManager {
        &self.memory
    }

    pub fn agent_manager(&self) -> &AgentManager {
        &self.agent_manager
    }

    pub fn kanban_store(&self) -> &crate::kanban_store::KanbanStore {
        &self.kanban_store
    }

    pub fn health_store(&self) -> &crate::agent_health_store::AgentHealthStore {
        &self.health_store
    }

    pub fn message_store(&self) -> &crate::agent_message_store::AgentMessageStore {
        &self.message_store
    }

    pub fn skill_manager(&self) -> &crate::skill_manager::SkillManager {
        &self.skill_manager
    }

    pub fn tool_registry(&self) -> &ToolRegistry {
        &self.tool_registry
    }

    pub fn session_ctx(&self) -> &SessionToolContext {
        &self.session_ctx
    }

    pub fn list_agent_templates(&self) -> Vec<AgentTemplate> {
        self.agent_manager.list()
    }

    pub fn get_agent_template(&self, name: &str) -> Option<AgentTemplate> {
        self.agent_manager.get(name)
    }

    pub fn delete_agent_template(&self, name: &str) -> Result<()> {
        self.agent_manager.delete(name)
    }

    pub fn list_skills(&self) -> Result<Vec<Skill>> {
        self.skill_manager.list()
    }

    pub fn save_skill(&self, skill: &Skill) -> Result<PathBuf> {
        self.skill_manager.save(skill)
    }

    pub fn delete_skill(&self, name: &str) -> Result<()> {
        self.skill_manager.delete(name)
    }
}
