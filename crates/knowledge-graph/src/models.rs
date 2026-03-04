use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEntity {
    pub id: String,
    pub canonical_name: String,
    pub entity_type: Option<String>,
    pub last_seen_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphFact {
    pub id: String,
    pub subject: String,
    pub predicate: String,
    pub object: String,
    pub confidence: f32,
    pub support_count: i64,
    pub last_seen_at: String,
    pub evidence: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub entity: GraphEntity,
    pub outgoing: Vec<GraphFact>,
    pub incoming: Vec<GraphFact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphStats {
    pub sources: i64,
    pub entities: i64,
    pub relations: i64,
    pub evidence: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestStats {
    pub scanned: u32,
    pub ingested: u32,
    pub skipped: u32,
    pub failed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedTriple {
    pub subject: String,
    pub predicate: String,
    pub object: String,
    pub subject_type: Option<String>,
    pub object_type: Option<String>,
    pub confidence: Option<f32>,
    pub evidence_snippet: Option<String>,
}
