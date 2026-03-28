use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use async_trait::async_trait;
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use walkdir::WalkDir;

use rushdino_common::{config::{KgCredentials, KnowledgeGraphConfig}, AppError, Result};
use rushdino_providers::Provider;

use crate::{
    adapters::{BoltAdapter, SparqlAdapter},
    extractor::extract_triples,
    models::{GraphEntity, GraphFact, GraphNode, GraphStats, IngestStats},
    service::is_supported_text_file,
};

/// Internal protocol abstraction. Implementations send queries to an external
/// knowledge graph over a specific network protocol (Bolt, SPARQL, …).
#[async_trait]
pub(crate) trait KgProtocolAdapter: Send + Sync {
    async fn write_triples(&self, triples: &[crate::models::ExtractedTriple]) -> Result<()>;
    async fn query_facts(&self, query: &str, limit: usize) -> Result<Vec<GraphFact>>;
    async fn search_entities(&self, query: &str, limit: usize) -> Result<Vec<GraphEntity>>;
    async fn get_node(&self, name: &str, limit: usize) -> Result<GraphNode>;
    async fn stats(&self) -> Result<GraphStats>;
}

/// Normalise an entity or predicate string for storage and fuzzy matching.
pub(crate) fn normalize(name: &str) -> String {
    name.to_lowercase()
        .replace(|c: char| !c.is_alphanumeric(), " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// External knowledge graph gateway.
///
/// Replaces the local SQLite-backed `KnowledgeGraphService`. The protocol
/// adapter is selected automatically from the `uri` scheme in config:
/// - `bolt://`, `neo4j://`, `neo4j+s://`, `neo4j+ssc://` → [`BoltAdapter`]
/// - `http://`, `https://` → [`SparqlAdapter`]
pub struct KgGateway {
    adapter: Arc<dyn KgProtocolAdapter>,
    provider: Arc<Provider>,
    config: KnowledgeGraphConfig,
    pool: Arc<SqlitePool>,
    data_dir: PathBuf,
}

impl KgGateway {
    pub async fn from_config(
        config: &KnowledgeGraphConfig,
        creds: &KgCredentials,
        provider: Arc<Provider>,
        pool: Arc<SqlitePool>,
        data_dir: PathBuf,
    ) -> Result<Self> {
        let uri = config.uri.as_deref().ok_or_else(|| {
            AppError::Validation(
                "knowledge_graph.uri is required when knowledge graph is enabled".to_owned(),
            )
        })?;

        let adapter: Arc<dyn KgProtocolAdapter> = if uri.starts_with("bolt://")
            || uri.starts_with("neo4j://")
            || uri.starts_with("neo4j+s://")
            || uri.starts_with("neo4j+ssc://")
        {
            Arc::new(
                BoltAdapter::new(
                    uri,
                    creds.username.as_deref().unwrap_or("neo4j"),
                    creds.password.as_deref().unwrap_or(""),
                )
                .await?,
            )
        } else {
            Arc::new(SparqlAdapter::new(uri, creds)?)
        };

        Ok(Self {
            adapter,
            provider,
            config: config.clone(),
            pool,
            data_dir,
        })
    }

    pub fn config(&self) -> &KnowledgeGraphConfig {
        &self.config
    }

    pub async fn ingest_text(
        &self,
        source_type: &str,
        source_ref: &str,
        text: &str,
    ) -> Result<IngestStats> {
        let mut stats = IngestStats {
            scanned: 1,
            ingested: 0,
            skipped: 0,
            failed: 0,
        };

        if !self.config.enabled {
            stats.skipped = 1;
            return Ok(stats);
        }

        let trimmed = text.trim();
        if trimmed.is_empty() {
            stats.skipped = 1;
            return Ok(stats);
        }

        let triples =
            extract_triples(&self.provider, trimmed, self.config.max_extraction_chars as usize)
                .await;

        match triples {
            Ok(ts) if ts.is_empty() => {
                stats.skipped = 1;
            }
            Ok(ts) => {
                self.adapter.write_triples(&ts).await?;
                stats.ingested = 1;
            }
            Err(err) => {
                tracing::warn!(source_type, source_ref, "KG extraction failed: {err}");
                stats.failed = 1;
            }
        }

        Ok(stats)
    }

    pub async fn ingest_document_file(&self, path: &Path) -> Result<IngestStats> {
        let text = tokio::fs::read_to_string(path).await?;
        self.ingest_text("document", &path.display().to_string(), &text)
            .await
    }

    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<GraphEntity>> {
        self.adapter.search_entities(query, limit).await
    }

    pub async fn facts(&self, query: &str, limit: usize) -> Result<Vec<GraphFact>> {
        self.adapter.query_facts(query, limit).await
    }

    pub async fn node(&self, id: &str, limit: usize) -> Result<GraphNode> {
        self.adapter.get_node(id, limit).await
    }

    pub async fn stats(&self) -> Result<GraphStats> {
        self.adapter.stats().await
    }

    pub async fn facts_for_prompt(
        &self,
        query: &str,
        _conversation_id: Option<&str>,
        max_facts: usize,
    ) -> Result<Vec<String>> {
        if !self.config.enabled || !self.config.auto_context {
            return Ok(Vec::new());
        }
        let configured = self.config.max_context_facts as usize;
        let limit = max_facts.min(configured).max(1);
        let facts = self.facts(query, limit).await?;
        Ok(facts_to_prompt_strings(&facts))
    }

    pub async fn facts_as_json(&self, query: &str, limit: usize) -> Result<Value> {
        let facts = self.facts(query, limit).await?;
        Ok(serde_json::json!({ "facts": facts }))
    }

    pub async fn run_backfill(&self) -> Result<IngestStats> {
        let mut stats = IngestStats {
            scanned: 0,
            ingested: 0,
            skipped: 0,
            failed: 0,
        };

        if !self.config.enabled {
            return Ok(stats);
        }

        if self.config.extract_from_conversations {
            let rows = sqlx::query("SELECT id, content FROM messages")
                .fetch_all(self.pool.as_ref())
                .await?;
            for row in rows {
                let id: String = row.try_get("id")?;
                let content: String = row.try_get("content")?;
                let res = self
                    .ingest_text("conversation_message", &id, &content)
                    .await?;
                accumulate(&mut stats, &res);
            }
        }

        if self.config.extract_from_memory {
            for path in list_memory_files(&self.data_dir) {
                stats.scanned = stats.scanned.saturating_add(1);
                match tokio::fs::read_to_string(&path).await {
                    Ok(content) => {
                        let res = self
                            .ingest_text("memory", &path.display().to_string(), &content)
                            .await?;
                        accumulate(&mut stats, &res);
                    }
                    Err(err) => {
                        tracing::warn!(
                            "KG memory backfill read failed {}: {err}",
                            path.display()
                        );
                        stats.failed = stats.failed.saturating_add(1);
                    }
                }
            }
        }

        if self.config.extract_from_documents {
            let docs_root = self.data_dir.join("documents");
            for entry in WalkDir::new(docs_root)
                .into_iter()
                .filter_map(std::result::Result::ok)
            {
                if !entry.file_type().is_file() {
                    continue;
                }
                let path = entry.path();
                if !is_supported_text_file(path) {
                    continue;
                }
                match self.ingest_document_file(path).await {
                    Ok(res) => accumulate(&mut stats, &res),
                    Err(err) => {
                        tracing::warn!(
                            "KG document backfill failed {}: {err}",
                            path.display()
                        );
                        stats.failed = stats.failed.saturating_add(1);
                    }
                }
            }
        }

        Ok(stats)
    }
}

fn facts_to_prompt_strings(facts: &[GraphFact]) -> Vec<String> {
    facts
        .iter()
        .map(|f| {
            if f.evidence.is_empty() {
                format!(
                    "{} --{}--> {} (confidence {:.2}, support {})",
                    f.subject, f.predicate, f.object, f.confidence, f.support_count
                )
            } else {
                format!(
                    "{} --{}--> {} (confidence {:.2}, support {}, evidence: {})",
                    f.subject,
                    f.predicate,
                    f.object,
                    f.confidence,
                    f.support_count,
                    f.evidence[0]
                )
            }
        })
        .collect()
}

fn accumulate(total: &mut IngestStats, delta: &IngestStats) {
    total.scanned = total.scanned.saturating_add(delta.scanned);
    total.ingested = total.ingested.saturating_add(delta.ingested);
    total.skipped = total.skipped.saturating_add(delta.skipped);
    total.failed = total.failed.saturating_add(delta.failed);
}

fn list_memory_files(data_dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for name in &[
        "MEMORY.md",
        "SOUL.md",
        "USER.md",
        "AGENTS.md",
        "TOOLS.md",
        "IDENTITY.md",
    ] {
        let path = data_dir.join(name);
        if path.exists() {
            files.push(path);
        }
    }
    let daily = data_dir.join("memory/daily");
    for entry in WalkDir::new(daily)
        .into_iter()
        .filter_map(std::result::Result::ok)
    {
        if entry.file_type().is_file()
            && entry.path().extension().and_then(|s| s.to_str()) == Some("md")
            && entry.file_name() != "MEMORY.md"
        {
            files.push(entry.path().to_path_buf());
        }
    }
    files
}
