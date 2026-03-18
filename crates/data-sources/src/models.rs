use std::sync::Arc;

use rushdino_common::KnowledgeGraphAccess;
use sqlx::AnyPool;

use crate::remote_kg_client::RemoteKgClient;

/// Knowledge graph backend — either a local (in-process) implementation or a
/// remote RushDino instance reached over HTTP.
pub enum KgBackend {
    Local(Arc<dyn KnowledgeGraphAccess>),
    Remote(RemoteKgClient),
}

impl KgBackend {
    pub async fn facts_as_json(
        &self,
        query: &str,
        limit: usize,
    ) -> rushdino_common::Result<serde_json::Value> {
        match self {
            KgBackend::Local(kg) => kg.facts_as_json(query, limit).await,
            KgBackend::Remote(client) => client.facts_as_json(query, limit).await,
        }
    }

    pub async fn ingest_text(
        &self,
        source_type: &str,
        source_ref: &str,
        text: &str,
    ) -> rushdino_common::Result<()> {
        match self {
            KgBackend::Local(kg) => kg.ingest_text(source_type, source_ref, text).await,
            KgBackend::Remote(client) => client.ingest_text(source_type, source_ref, text).await,
        }
    }
}

/// A named, described knowledge graph source exposed to agent tools.
pub struct KnowledgeGraphSource {
    pub name: String,
    pub description: String,
    pub backend: KgBackend,
}

/// A named, described SQL database source exposed to agent tools.
pub struct SqlDatabaseSource {
    pub name: String,
    pub description: String,
    pub read_only: bool,
    pub pool: AnyPool,
}
