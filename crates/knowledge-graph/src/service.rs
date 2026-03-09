use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use walkdir::WalkDir;

use rushdino_common::{config::KnowledgeGraphConfig, Result};
use rushdino_providers::Provider;

use crate::{
    extractor::extract_triples,
    models::{GraphEntity, GraphFact, GraphNode, GraphStats, IngestStats},
    repository::KnowledgeGraphRepository,
};

#[derive(Clone)]
pub struct KnowledgeGraphService {
    repository: Arc<KnowledgeGraphRepository>,
    provider: Arc<Provider>,
    config: KnowledgeGraphConfig,
    data_dir: PathBuf,
}

impl KnowledgeGraphService {
    pub fn new(
        pool: SqlitePool,
        provider: Arc<Provider>,
        config: KnowledgeGraphConfig,
        data_dir: PathBuf,
    ) -> Self {
        Self {
            repository: Arc::new(KnowledgeGraphRepository::new(pool)),
            provider,
            config,
            data_dir,
        }
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

        let clipped = truncate_text(trimmed, self.config.max_extraction_chars as usize);
        let hash = hash_content(&clipped);

        let (source_id, changed) = self
            .repository
            .upsert_source(source_type, source_ref, &hash)
            .await?;

        if !changed {
            stats.skipped = 1;
            return Ok(stats);
        }

        let triples = extract_triples(
            &self.provider,
            &clipped,
            self.config.max_extraction_chars as usize,
        )
        .await;
        match triples {
            Ok(triples) if triples.is_empty() => {
                stats.skipped = 1;
            }
            Ok(triples) => {
                let _ = self.repository.upsert_triples(&source_id, &triples).await?;
                stats.ingested = 1;
            }
            Err(err) => {
                tracing::warn!(
                    source_type,
                    source_ref,
                    "knowledge graph extraction failed: {err}"
                );
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
        self.repository.search_entities(query, limit).await
    }

    pub async fn facts(&self, query: &str, limit: usize) -> Result<Vec<GraphFact>> {
        self.repository.query_facts(query, limit).await
    }

    pub async fn node(&self, id: &str, limit: usize) -> Result<GraphNode> {
        self.repository.get_node(id, limit).await
    }

    pub async fn stats(&self) -> Result<GraphStats> {
        self.repository.stats().await
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

        let facts = self.facts(query, max_facts).await?;
        Ok(facts
            .into_iter()
            .map(|fact| {
                if fact.evidence.is_empty() {
                    format!(
                        "{} --{}--> {} (confidence {:.2}, support {})",
                        fact.subject,
                        fact.predicate,
                        fact.object,
                        fact.confidence,
                        fact.support_count
                    )
                } else {
                    format!(
                        "{} --{}--> {} (confidence {:.2}, support {}, evidence: {})",
                        fact.subject,
                        fact.predicate,
                        fact.object,
                        fact.confidence,
                        fact.support_count,
                        fact.evidence[0]
                    )
                }
            })
            .collect())
    }

    pub async fn facts_as_json(&self, query: &str, limit: usize) -> Result<serde_json::Value> {
        let facts = self.facts(query, limit).await?;
        Ok(json!({ "facts": facts }))
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
                .fetch_all(self.repository.pool())
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
                            "knowledge graph memory backfill read failed {}: {err}",
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
                let res = self.ingest_document_file(path).await;
                match res {
                    Ok(res) => accumulate(&mut stats, &res),
                    Err(err) => {
                        tracing::warn!(
                            "knowledge graph document backfill failed {}: {err}",
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

fn list_memory_files(data_dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let root_memory = data_dir.join("MEMORY.md");
    let legacy_memory = data_dir.join("memory").join("MEMORY.md");
    if root_memory.exists() {
        files.push(root_memory);
    } else if legacy_memory.exists() {
        files.push(legacy_memory);
    }

    for relative in ["SOUL.md", "USER.md", "AGENTS.md", "TOOLS.md", "IDENTITY.md"] {
        let path = data_dir.join(relative);
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

pub fn is_supported_text_file(path: &Path) -> bool {
    const EXTENSIONS: &[&str] = &[
        "txt", "md", "markdown", "json", "jsonl", "yaml", "yml", "toml", "ini", "log", "rs", "ts",
        "tsx", "js", "jsx", "py", "go", "java", "kt", "swift", "c", "cpp", "h", "hpp", "sh", "zsh",
        "bash", "sql", "html", "css", "scss", "xml", "csv",
    ];

    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn hash_content(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hex::encode(hasher.finalize())
}

fn truncate_text(input: &str, max_chars: usize) -> String {
    if input.chars().count() <= max_chars {
        return input.to_owned();
    }
    input.chars().take(max_chars).collect::<String>()
}

fn accumulate(total: &mut IngestStats, add: &IngestStats) {
    total.scanned = total.scanned.saturating_add(add.scanned);
    total.ingested = total.ingested.saturating_add(add.ingested);
    total.skipped = total.skipped.saturating_add(add.skipped);
    total.failed = total.failed.saturating_add(add.failed);
}
