use serde::{Deserialize, Serialize};

/// A single step in a bundled workflow template.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowTemplateStep {
    pub position: u32,
    pub name: String,
    pub agent_id: String,
    pub instructions: String,
}

/// A bundled workflow template that users can import to create a new workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub steps: Vec<WorkflowTemplateStep>,
}

/// Bundled template JSON files embedded at compile time.
const BUNDLED_TEMPLATES_JSON: &[(&str, &str)] = &[
    (
        "stock-market-research",
        include_str!("workflow_templates/stock-market-research.json"),
    ),
    (
        "social-media-management",
        include_str!("workflow_templates/social-media-management.json"),
    ),
    (
        "create-poster",
        include_str!("workflow_templates/create-poster.json"),
    ),
];

/// Parse and return all bundled workflow templates. Skips any that fail to parse.
pub fn get_bundled_templates() -> Vec<WorkflowTemplate> {
    BUNDLED_TEMPLATES_JSON
        .iter()
        .filter_map(|(_, json)| serde_json::from_str(json).ok())
        .collect()
}

/// Find a bundled template by its ID.
pub fn get_template_by_id(id: &str) -> Option<WorkflowTemplate> {
    BUNDLED_TEMPLATES_JSON
        .iter()
        .find(|(template_id, _)| *template_id == id)
        .and_then(|(_, json)| serde_json::from_str(json).ok())
}
