use async_trait::async_trait;
use neo4rs::{query, Graph};
use uuid::Uuid;

use rushdino_common::{AppError, Result};

use crate::{
    gateway::{normalize, KgProtocolAdapter},
    models::{ExtractedTriple, GraphEntity, GraphFact, GraphNode, GraphStats},
};

/// Bolt/Cypher protocol adapter — connects to Neo4j, Memgraph, or any
/// Bolt-compatible graph database.
pub(crate) struct BoltAdapter {
    graph: Graph,
}

impl BoltAdapter {
    /// Construct a new adapter. `Graph::new` is synchronous; the async work
    /// here is only for creating the entity index on startup.
    pub async fn new(uri: &str, username: &str, password: &str) -> Result<Self> {
        let graph = Graph::new(uri, username, password)
            .map_err(|e| AppError::Provider(format!("Bolt connection failed: {e}")))?;

        // Ensure index exists; ignore errors (index may already exist).
        let _ = graph
            .run(query(
                "CREATE INDEX entity_name IF NOT EXISTS FOR (e:Entity) ON (e.normalized)",
            ))
            .await;

        Ok(Self { graph })
    }
}

#[async_trait]
impl KgProtocolAdapter for BoltAdapter {
    async fn write_triples(&self, triples: &[ExtractedTriple]) -> Result<()> {
        for t in triples {
            let sn = normalize(&t.subject);
            let on = normalize(&t.object);
            let conf = t.confidence.unwrap_or(1.0) as f64;

            self.graph
                .run(
                    query(
                        "MERGE (s:Entity {normalized: $sn})
                         SET s.name = $s, s.type = $st
                         MERGE (o:Entity {normalized: $on})
                         SET o.name = $o, o.type = $ot
                         MERGE (s)-[r:RELATION {predicate: $pred}]->(o)
                         ON CREATE SET r.confidence = $conf,
                                       r.support    = 1,
                                       r.first_seen = datetime(),
                                       r.last_seen  = datetime()
                         ON MATCH  SET r.confidence = ($conf + r.confidence) / 2.0,
                                       r.support    = r.support + 1,
                                       r.last_seen  = datetime()",
                    )
                    .param("sn", sn)
                    .param("s", t.subject.clone())
                    .param("st", t.subject_type.clone().unwrap_or_default())
                    .param("on", on)
                    .param("o", t.object.clone())
                    .param("ot", t.object_type.clone().unwrap_or_default())
                    .param("pred", t.predicate.clone())
                    .param("conf", conf),
                )
                .await
                .map_err(|e| AppError::Provider(format!("Bolt write failed: {e}")))?;
        }
        Ok(())
    }

    async fn query_facts(&self, query_str: &str, limit: usize) -> Result<Vec<GraphFact>> {
        let q = normalize(query_str);
        let mut stream = self
            .graph
            .execute(
                query(
                    "MATCH (s:Entity)-[r:RELATION]->(o:Entity)
                     WHERE s.normalized CONTAINS $q
                        OR o.normalized CONTAINS $q
                        OR r.predicate   CONTAINS $q
                     RETURN s.name AS subject,
                            r.predicate AS predicate,
                            o.name AS object,
                            r.confidence AS confidence,
                            r.support AS support,
                            toString(r.last_seen) AS last_seen
                     ORDER BY r.confidence * r.support DESC
                     LIMIT $lim",
                )
                .param("q", q)
                .param("lim", limit as i64),
            )
            .await
            .map_err(|e| AppError::Provider(format!("Bolt query failed: {e}")))?;

        let mut facts = Vec::new();
        while let Ok(Some(row)) = stream.next().await {
            let subject: String = row.get::<String>("subject").unwrap_or_default();
            let predicate: String = row.get::<String>("predicate").unwrap_or_default();
            let object: String = row.get::<String>("object").unwrap_or_default();
            let confidence: f64 = row.get::<f64>("confidence").unwrap_or(1.0);
            let support: i64 = row.get::<i64>("support").unwrap_or(1);
            let last_seen: String = row.get::<String>("last_seen").unwrap_or_default();

            facts.push(GraphFact {
                id: Uuid::new_v4().to_string(),
                subject,
                predicate,
                object,
                confidence: confidence as f32,
                support_count: support,
                last_seen_at: last_seen,
                evidence: Vec::new(),
            });
        }
        Ok(facts)
    }

    async fn search_entities(&self, query_str: &str, limit: usize) -> Result<Vec<GraphEntity>> {
        let q = normalize(query_str);
        let mut stream = self
            .graph
            .execute(
                query(
                    "MATCH (e:Entity)
                     WHERE e.normalized CONTAINS $q
                     RETURN e.name AS name,
                            e.type AS entity_type,
                            toString(coalesce(e.last_seen, datetime())) AS last_seen
                     ORDER BY e.last_seen DESC
                     LIMIT $lim",
                )
                .param("q", q)
                .param("lim", limit as i64),
            )
            .await
            .map_err(|e| AppError::Provider(format!("Bolt entity search failed: {e}")))?;

        let mut entities = Vec::new();
        while let Ok(Some(row)) = stream.next().await {
            let name: String = row.get::<String>("name").unwrap_or_default();
            // entity_type may be absent — convert the Result to Option.
            let entity_type: Option<String> = row.get::<String>("entity_type").ok();
            let last_seen: String = row.get::<String>("last_seen").unwrap_or_default();

            entities.push(GraphEntity {
                id: normalize(&name),
                canonical_name: name,
                entity_type,
                last_seen_at: last_seen,
            });
        }
        Ok(entities)
    }

    async fn get_node(&self, name: &str, limit: usize) -> Result<GraphNode> {
        let normalized = normalize(name);

        let mut ent_stream = self
            .graph
            .execute(
                query(
                    "MATCH (e:Entity)
                     WHERE e.normalized = $n OR e.name = $raw
                     RETURN e.name AS name, e.type AS entity_type,
                            toString(coalesce(e.last_seen, datetime())) AS last_seen
                     LIMIT 1",
                )
                .param("n", normalized.clone())
                .param("raw", name.to_owned()),
            )
            .await
            .map_err(|e| AppError::Provider(format!("Bolt node lookup failed: {e}")))?;

        let entity = if let Ok(Some(row)) = ent_stream.next().await {
            let ename: String = row
                .get::<String>("name")
                .unwrap_or_else(|_| name.to_owned());
            let entity_type: Option<String> = row.get::<String>("entity_type").ok();
            let last_seen: String = row.get::<String>("last_seen").unwrap_or_default();
            GraphEntity {
                id: normalized.clone(),
                canonical_name: ename,
                entity_type,
                last_seen_at: last_seen,
            }
        } else {
            GraphEntity {
                id: normalized.clone(),
                canonical_name: name.to_owned(),
                entity_type: None,
                last_seen_at: String::new(),
            }
        };

        let outgoing = self.query_facts(&entity.canonical_name, limit).await?;
        let incoming = fetch_incoming(&self.graph, &entity.canonical_name, limit).await?;

        Ok(GraphNode {
            entity,
            outgoing,
            incoming,
        })
    }

    async fn stats(&self) -> Result<GraphStats> {
        let mut stream = self
            .graph
            .execute(query(
                "MATCH (e:Entity) WITH count(e) AS entities
                 MATCH ()-[r:RELATION]->() WITH entities, count(r) AS relations
                 RETURN entities, relations",
            ))
            .await
            .map_err(|e| AppError::Provider(format!("Bolt stats query failed: {e}")))?;

        if let Ok(Some(row)) = stream.next().await {
            let entities: i64 = row.get::<i64>("entities").unwrap_or(0);
            let relations: i64 = row.get::<i64>("relations").unwrap_or(0);
            Ok(GraphStats {
                sources: 0,
                entities,
                relations,
                evidence: 0,
            })
        } else {
            Ok(GraphStats {
                sources: 0,
                entities: 0,
                relations: 0,
                evidence: 0,
            })
        }
    }
}

async fn fetch_incoming(
    graph: &Graph,
    object_name: &str,
    limit: usize,
) -> Result<Vec<GraphFact>> {
    let q = normalize(object_name);
    let mut stream = graph
        .execute(
            query(
                "MATCH (s:Entity)-[r:RELATION]->(o:Entity)
                 WHERE o.normalized CONTAINS $q
                 RETURN s.name AS subject, r.predicate AS predicate, o.name AS object,
                        r.confidence AS confidence, r.support AS support,
                        toString(r.last_seen) AS last_seen
                 LIMIT $lim",
            )
            .param("q", q)
            .param("lim", limit as i64),
        )
        .await
        .map_err(|e| AppError::Provider(format!("Bolt incoming query failed: {e}")))?;

    let mut facts = Vec::new();
    while let Ok(Some(row)) = stream.next().await {
        facts.push(GraphFact {
            id: Uuid::new_v4().to_string(),
            subject: row.get::<String>("subject").unwrap_or_default(),
            predicate: row.get::<String>("predicate").unwrap_or_default(),
            object: row.get::<String>("object").unwrap_or_default(),
            confidence: row.get::<f64>("confidence").unwrap_or(1.0) as f32,
            support_count: row.get::<i64>("support").unwrap_or(1),
            last_seen_at: row.get::<String>("last_seen").unwrap_or_default(),
            evidence: Vec::new(),
        });
    }
    Ok(facts)
}
