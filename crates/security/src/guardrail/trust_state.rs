use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::glob::glob_match;
use super::types::{ActionCategory, TrustLevel};

const L0_TO_L1_THRESHOLD: u32 = 5;
const L1_TO_L2_THRESHOLD: u32 = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CategoryState {
    level: TrustLevel,
    consecutive_approvals: u32,
}

impl Default for CategoryState {
    fn default() -> Self {
        Self {
            level: TrustLevel::Untrusted,
            consecutive_approvals: 0,
        }
    }
}

/// Per-agent trust state tracking approval history and approved patterns per action category.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustState {
    agent_id: String,
    categories: HashMap<ActionCategory, CategoryState>,
    approved_patterns: HashMap<ActionCategory, Vec<String>>,
}

impl TrustState {
    /// Create a new TrustState for the given agent, defaulting all categories to L0 (Untrusted).
    pub fn new(agent_id: &str) -> Self {
        let mut categories = HashMap::new();
        for cat in [
            ActionCategory::Bash,
            ActionCategory::Network,
            ActionCategory::FsRead,
            ActionCategory::FsWrite,
        ] {
            categories.insert(cat, CategoryState::default());
        }
        Self {
            agent_id: agent_id.to_string(),
            categories,
            approved_patterns: HashMap::new(),
        }
    }

    /// Return the current trust level for a category.
    pub fn level(&self, category: ActionCategory) -> TrustLevel {
        self.categories
            .get(&category)
            .map(|s| s.level)
            .unwrap_or(TrustLevel::Untrusted)
    }

    /// Return the consecutive approval count for a category.
    pub fn consecutive_approvals(&self, category: ActionCategory) -> u32 {
        self.categories
            .get(&category)
            .map(|s| s.consecutive_approvals)
            .unwrap_or(0)
    }

    /// Manually set the trust level for a category, resetting the approval counter.
    pub fn set_level(&mut self, category: ActionCategory, level: TrustLevel) {
        let state = self.categories.entry(category).or_default();
        state.level = level;
        state.consecutive_approvals = 0;
    }

    /// Record a user approval for a category, incrementing the consecutive counter.
    pub fn record_approval(&mut self, category: ActionCategory) {
        let state = self.categories.entry(category).or_default();
        state.consecutive_approvals += 1;
    }

    /// Record a user denial for a category: resets the counter and demotes one trust level.
    pub fn record_denial(&mut self, category: ActionCategory) {
        let state = self.categories.entry(category).or_default();
        state.consecutive_approvals = 0;
        state.level = match state.level {
            TrustLevel::Trusted => TrustLevel::Supervised,
            TrustLevel::Supervised => TrustLevel::Untrusted,
            TrustLevel::Untrusted => TrustLevel::Untrusted,
        };
    }

    /// Return true if the approval count has reached the threshold to suggest a level promotion.
    pub fn should_suggest_promotion(&self, category: ActionCategory) -> bool {
        let state = match self.categories.get(&category) {
            Some(s) => s,
            None => return false,
        };
        match state.level {
            TrustLevel::Untrusted => state.consecutive_approvals >= L0_TO_L1_THRESHOLD,
            TrustLevel::Supervised => state.consecutive_approvals >= L1_TO_L2_THRESHOLD,
            TrustLevel::Trusted => false,
        }
    }

    /// Add a glob pattern to the approved patterns for a category.
    pub fn add_pattern(&mut self, category: ActionCategory, pattern: String) {
        self.approved_patterns
            .entry(category)
            .or_default()
            .push(pattern);
    }

    /// Return true if the given action string matches any approved pattern for the category.
    pub fn matches_pattern(&self, category: ActionCategory, action: &str) -> bool {
        let patterns = match self.approved_patterns.get(&category) {
            Some(p) => p,
            None => return false,
        };
        patterns.iter().any(|p| glob_match(p, action))
    }

    /// Serialize and persist trust state to a JSON file at the given path.
    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(self)
            .map_err(std::io::Error::other)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, json)
    }

    /// Load and deserialize trust state from a JSON file at the given path.
    pub fn load(path: &Path) -> std::io::Result<Self> {
        let json = std::fs::read_to_string(path)?;
        serde_json::from_str(&json)
            .map_err(std::io::Error::other)
    }

    /// Load trust state from file, or create a fresh state if the file doesn't exist.
    pub fn load_or_default(path: &Path, agent_id: &str) -> Self {
        Self::load(path).unwrap_or_else(|_| Self::new(agent_id))
    }

    /// Return the agent ID.
    pub fn agent_id(&self) -> &str {
        &self.agent_id
    }
}

