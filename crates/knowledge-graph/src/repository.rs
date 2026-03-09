use chrono::Utc;
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use rushdino_common::{AppError, Result};

use crate::models::{ExtractedTriple, GraphEntity, GraphFact, GraphNode, GraphStats};

pub struct KnowledgeGraphRepository {
    pool: SqlitePool,
}

impl KnowledgeGraphRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn upsert_source(
        &self,
        source_type: &str,
        source_ref: &str,
        content_hash: &str,
    ) -> Result<(String, bool)> {
        let row = sqlx::query(
            "SELECT id, content_hash FROM kg_sources WHERE source_type = ?1 AND source_ref = ?2",
        )
        .bind(source_type)
        .bind(source_ref)
        .fetch_optional(&self.pool)
        .await?;

        let now = Utc::now().to_rfc3339();

        if let Some(row) = row {
            let id: String = row.try_get("id")?;
            let existing_hash: String = row.try_get("content_hash")?;
            if existing_hash == content_hash {
                return Ok((id, false));
            }

            sqlx::query("UPDATE kg_sources SET content_hash = ?1, updated_at = ?2 WHERE id = ?3")
                .bind(content_hash)
                .bind(now)
                .bind(&id)
                .execute(&self.pool)
                .await?;
            return Ok((id, true));
        }

        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO kg_sources (id, source_type, source_ref, content_hash, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(&id)
        .bind(source_type)
        .bind(source_ref)
        .bind(content_hash)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok((id, true))
    }

    pub async fn upsert_triples(
        &self,
        source_id: &str,
        triples: &[ExtractedTriple],
    ) -> Result<u32> {
        let mut count = 0_u32;
        for triple in triples {
            let subject_id = self
                .upsert_entity(&triple.subject, triple.subject_type.as_deref())
                .await?;
            let object_id = self
                .upsert_entity(&triple.object, triple.object_type.as_deref())
                .await?;
            let relation_id = self
                .upsert_relation(
                    &subject_id,
                    &normalize_predicate(&triple.predicate),
                    &object_id,
                    triple.confidence.unwrap_or(0.5),
                )
                .await?;
            self.insert_evidence(&relation_id, source_id, triple.evidence_snippet.as_deref())
                .await?;
            count = count.saturating_add(1);
        }
        Ok(count)
    }

    pub async fn search_entities(&self, query: &str, limit: usize) -> Result<Vec<GraphEntity>> {
        let needle = format!("%{}%", normalize_name(query));
        let rows = sqlx::query(
            "SELECT id, canonical_name, entity_type, last_seen_at
             FROM kg_entities
             WHERE normalized_name LIKE ?1
             ORDER BY last_seen_at DESC
             LIMIT ?2",
        )
        .bind(needle)
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                Ok(GraphEntity {
                    id: row.try_get("id")?,
                    canonical_name: row.try_get("canonical_name")?,
                    entity_type: row.try_get("entity_type")?,
                    last_seen_at: row.try_get("last_seen_at")?,
                })
            })
            .collect()
    }

    pub async fn query_facts(&self, query: &str, limit: usize) -> Result<Vec<GraphFact>> {
        let needle = format!("%{}%", normalize_name(query));
        let rows = sqlx::query(
            "SELECT r.id,
                    s.canonical_name AS subject,
                    r.predicate,
                    o.canonical_name AS object,
                    r.confidence,
                    r.support_count,
                    r.last_seen_at
             FROM kg_relations r
             INNER JOIN kg_entities s ON s.id = r.subject_entity_id
             INNER JOIN kg_entities o ON o.id = r.object_entity_id
             WHERE s.normalized_name LIKE ?1 OR o.normalized_name LIKE ?1 OR r.predicate LIKE ?2
             ORDER BY (r.confidence * r.support_count) DESC, r.last_seen_at DESC
             LIMIT ?3",
        )
        .bind(needle)
        .bind(format!("%{}%", normalize_predicate(query)))
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await?;

        let mut facts = Vec::with_capacity(rows.len());
        for row in rows {
            let relation_id: String = row.try_get("id")?;
            let evidence = self.load_evidence(&relation_id, 3).await?;
            facts.push(GraphFact {
                id: relation_id,
                subject: row.try_get("subject")?,
                predicate: row.try_get("predicate")?,
                object: row.try_get("object")?,
                confidence: row.try_get::<f64, _>("confidence")? as f32,
                support_count: row.try_get("support_count")?,
                last_seen_at: row.try_get("last_seen_at")?,
                evidence,
            });
        }

        Ok(facts)
    }

    pub async fn get_node(&self, entity_id: &str, limit: usize) -> Result<GraphNode> {
        let entity_row = sqlx::query(
            "SELECT id, canonical_name, entity_type, last_seen_at
             FROM kg_entities
             WHERE id = ?1",
        )
        .bind(entity_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("graph node {entity_id} not found")))?;

        let entity = GraphEntity {
            id: entity_row.try_get("id")?,
            canonical_name: entity_row.try_get("canonical_name")?,
            entity_type: entity_row.try_get("entity_type")?,
            last_seen_at: entity_row.try_get("last_seen_at")?,
        };

        let outgoing = self.load_node_relations(entity_id, true, limit).await?;
        let incoming = self.load_node_relations(entity_id, false, limit).await?;

        Ok(GraphNode {
            entity,
            outgoing,
            incoming,
        })
    }

    pub async fn stats(&self) -> Result<GraphStats> {
        let sources = count_table(&self.pool, "kg_sources").await?;
        let entities = count_table(&self.pool, "kg_entities").await?;
        let relations = count_table(&self.pool, "kg_relations").await?;
        let evidence = count_table(&self.pool, "kg_relation_evidence").await?;
        Ok(GraphStats {
            sources,
            entities,
            relations,
            evidence,
        })
    }

    async fn upsert_entity(
        &self,
        canonical_name: &str,
        entity_type: Option<&str>,
    ) -> Result<String> {
        let normalized = normalize_name(canonical_name);
        let now = Utc::now().to_rfc3339();

        let row = sqlx::query("SELECT id FROM kg_entities WHERE normalized_name = ?1")
            .bind(&normalized)
            .fetch_optional(&self.pool)
            .await?;

        if let Some(row) = row {
            let id: String = row.try_get("id")?;
            sqlx::query(
                "UPDATE kg_entities
                 SET canonical_name = ?1,
                     entity_type = COALESCE(?2, entity_type),
                     last_seen_at = ?3
                 WHERE id = ?4",
            )
            .bind(canonical_name)
            .bind(entity_type)
            .bind(now)
            .bind(&id)
            .execute(&self.pool)
            .await?;
            return Ok(id);
        }

        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO kg_entities (id, canonical_name, normalized_name, entity_type, first_seen_at, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(&id)
        .bind(canonical_name)
        .bind(&normalized)
        .bind(entity_type)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(id)
    }

    async fn upsert_relation(
        &self,
        subject_entity_id: &str,
        predicate: &str,
        object_entity_id: &str,
        confidence: f32,
    ) -> Result<String> {
        let now = Utc::now().to_rfc3339();

        let row = sqlx::query(
            "SELECT id, support_count, confidence
             FROM kg_relations
             WHERE subject_entity_id = ?1 AND predicate = ?2 AND object_entity_id = ?3",
        )
        .bind(subject_entity_id)
        .bind(predicate)
        .bind(object_entity_id)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            let id: String = row.try_get("id")?;
            let support_count: i64 = row.try_get("support_count")?;
            let existing_confidence: f64 = row.try_get("confidence")?;
            let next_confidence = existing_confidence.max(confidence as f64);
            sqlx::query(
                "UPDATE kg_relations
                 SET confidence = ?1,
                     support_count = ?2,
                     last_seen_at = ?3
                 WHERE id = ?4",
            )
            .bind(next_confidence)
            .bind(support_count + 1)
            .bind(now)
            .bind(&id)
            .execute(&self.pool)
            .await?;
            return Ok(id);
        }

        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO kg_relations (id, subject_entity_id, predicate, object_entity_id, confidence, support_count, first_seen_at, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(&id)
        .bind(subject_entity_id)
        .bind(predicate)
        .bind(object_entity_id)
        .bind(confidence)
        .bind(1_i64)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(id)
    }

    async fn insert_evidence(
        &self,
        relation_id: &str,
        source_id: &str,
        snippet: Option<&str>,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO kg_relation_evidence (id, relation_id, source_id, snippet, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(relation_id)
        .bind(source_id)
        .bind(snippet)
        .bind(Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn load_evidence(&self, relation_id: &str, limit: usize) -> Result<Vec<String>> {
        let rows = sqlx::query(
            "SELECT snippet
             FROM kg_relation_evidence
             WHERE relation_id = ?1 AND snippet IS NOT NULL AND snippet <> ''
             ORDER BY created_at DESC
             LIMIT ?2",
        )
        .bind(relation_id)
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await?;

        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(row.try_get::<String, _>("snippet")?);
        }
        Ok(out)
    }

    async fn load_node_relations(
        &self,
        entity_id: &str,
        outgoing: bool,
        limit: usize,
    ) -> Result<Vec<GraphFact>> {
        let filter_col = if outgoing {
            "r.subject_entity_id"
        } else {
            "r.object_entity_id"
        };

        let query = format!(
            "SELECT r.id,
                    s.canonical_name AS subject,
                    r.predicate,
                    o.canonical_name AS object,
                    r.confidence,
                    r.support_count,
                    r.last_seen_at
             FROM kg_relations r
             INNER JOIN kg_entities s ON s.id = r.subject_entity_id
             INNER JOIN kg_entities o ON o.id = r.object_entity_id
             WHERE {filter_col} = ?1
             ORDER BY (r.confidence * r.support_count) DESC, r.last_seen_at DESC
             LIMIT ?2"
        );

        let rows = sqlx::query(&query)
            .bind(entity_id)
            .bind(limit as i64)
            .fetch_all(&self.pool)
            .await?;

        let mut facts = Vec::with_capacity(rows.len());
        for row in rows {
            let relation_id: String = row.try_get("id")?;
            facts.push(GraphFact {
                id: relation_id.clone(),
                subject: row.try_get("subject")?,
                predicate: row.try_get("predicate")?,
                object: row.try_get("object")?,
                confidence: row.try_get::<f64, _>("confidence")? as f32,
                support_count: row.try_get("support_count")?,
                last_seen_at: row.try_get("last_seen_at")?,
                evidence: self.load_evidence(&relation_id, 3).await?,
            });
        }

        Ok(facts)
    }
}

async fn count_table(pool: &SqlitePool, table: &str) -> Result<i64> {
    let query = format!("SELECT COUNT(*) AS count FROM {table}");
    let row = sqlx::query(&query).fetch_one(pool).await?;
    Ok(row.try_get("count")?)
}

pub fn normalize_name(input: &str) -> String {
    input
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn normalize_predicate(input: &str) -> String {
    let normalized = normalize_name(input);
    normalized
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect::<String>()
        .split('_')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}
