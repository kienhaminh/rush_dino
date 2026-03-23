use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    Skill,
    Category,
}

impl NodeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            NodeType::Skill => "skill",
            NodeType::Category => "category",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "skill" => Some(NodeType::Skill),
            "category" => Some(NodeType::Category),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeType {
    BelongsTo,
    RelatedTo,
}

impl EdgeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            EdgeType::BelongsTo => "belongs_to",
            EdgeType::RelatedTo => "related_to",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "belongs_to" => Some(EdgeType::BelongsTo),
            "related_to" => Some(EdgeType::RelatedTo),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeOrigin {
    Manual,
    Inferred,
}

impl EdgeOrigin {
    pub fn as_str(&self) -> &'static str {
        match self {
            EdgeOrigin::Manual => "manual",
            EdgeOrigin::Inferred => "inferred",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "manual" => Some(EdgeOrigin::Manual),
            "inferred" => Some(EdgeOrigin::Inferred),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillNode {
    pub id: String,
    pub name: String,
    pub node_type: NodeType,
    pub description: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEdge {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub edge_type: EdgeType,
    pub weight: f64,
    pub origin: EdgeOrigin,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoredSkill {
    pub name: String,
    pub description: String,
    pub score: f64,
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphSnapshot {
    pub nodes: Vec<SkillNode>,
    pub edges: Vec<SkillEdge>,
}
