use async_trait::async_trait;
use reqwest::Client;
use serde_json::Value;
use uuid::Uuid;

use rushdino_common::{config::KgCredentials, AppError, Result};

use crate::{
    gateway::{normalize, KgProtocolAdapter},
    models::{ExtractedTriple, GraphEntity, GraphFact, GraphNode, GraphStats},
};

const RD: &str = "urn:rushdino:";

/// SPARQL 1.1 HTTP adapter — works with any SPARQL-compliant endpoint
/// (Apache Jena Fuseki, Oxigraph, Stardog, GraphDB, Blazegraph, Virtuoso, …).
///
/// The same URI is used for both queries (SELECT) and updates (INSERT/DELETE).
/// Auth is supported via HTTP Basic (username/password) or Bearer token (api_key).
pub(crate) struct SparqlAdapter {
    client: Client,
    endpoint: String,
    auth_header: Option<String>,
}

impl SparqlAdapter {
    pub fn new(uri: &str, creds: &KgCredentials) -> Result<Self> {
        // Build auth header once at construction.
        let auth_header = if let Some(key) = &creds.api_key {
            Some(format!("Bearer {key}"))
        } else if let (Some(user), Some(pass)) = (&creds.username, &creds.password) {
            use base64::Engine as _;
            let encoded =
                base64::engine::general_purpose::STANDARD.encode(format!("{user}:{pass}"));
            Some(format!("Basic {encoded}"))
        } else {
            None
        };

        Ok(Self {
            client: Client::new(),
            endpoint: uri.to_owned(),
            auth_header,
        })
    }

    fn request_builder(&self, url: &str) -> reqwest::RequestBuilder {
        let req = self.client.post(url);
        if let Some(auth) = &self.auth_header {
            req.header("Authorization", auth)
        } else {
            req
        }
    }

    async fn sparql_update(&self, update: &str) -> Result<()> {
        let resp = self
            .request_builder(&self.endpoint)
            .header("Content-Type", "application/sparql-update")
            .body(update.to_owned())
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("SPARQL update request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Provider(format!(
                "SPARQL update returned {status}: {body}"
            )));
        }
        Ok(())
    }

    async fn sparql_select(&self, query: &str) -> Result<Value> {
        let resp = self
            .request_builder(&self.endpoint)
            .header("Content-Type", "application/sparql-query")
            .header("Accept", "application/sparql-results+json")
            .body(query.to_owned())
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("SPARQL query request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Provider(format!(
                "SPARQL query returned {status}: {body}"
            )));
        }

        resp.json::<Value>()
            .await
            .map_err(|e| AppError::Provider(format!("SPARQL response parse failed: {e}")))
    }
}

/// Extract the string value from a SPARQL result binding cell.
fn binding_str(cell: &Value) -> String {
    cell.get("value")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

/// Iterate over `results.bindings` from a SPARQL SELECT response.
fn bindings(response: &Value) -> Vec<&Value> {
    response
        .pointer("/results/bindings")
        .and_then(Value::as_array)
        .map(|v| v.iter().collect())
        .unwrap_or_default()
}

/// Build a short URI for an entity or predicate name.
fn entity_uri(name: &str) -> String {
    let n = normalize(name).replace(' ', "_");
    format!("<{RD}entity:{n}>")
}

fn predicate_uri(pred: &str) -> String {
    let p = normalize(pred).replace(' ', "_");
    format!("<{RD}predicate:{p}>")
}

#[async_trait]
impl KgProtocolAdapter for SparqlAdapter {
    async fn write_triples(&self, triples: &[ExtractedTriple]) -> Result<()> {
        if triples.is_empty() {
            return Ok(());
        }

        let mut stmts = String::new();
        for t in triples {
            let s_uri = entity_uri(&t.subject);
            let _p_uri = predicate_uri(&t.predicate);
            let o_uri = entity_uri(&t.object);
            let s_name = t.subject.replace('"', "\\\"");
            let o_name = t.object.replace('"', "\\\"");
            let conf = t.confidence.unwrap_or(1.0);

            stmts.push_str(&format!(
                "{s_uri} <{RD}name> \"{s_name}\" ; a <{RD}Entity> .\n\
                 {o_uri} <{RD}name> \"{o_name}\" ; a <{RD}Entity> .\n\
                 _:rel_{id} a <{RD}Relation> ;\n  \
                   <{RD}subject>   {s_uri} ;\n  \
                   <{RD}predicate> \"{pred}\" ;\n  \
                   <{RD}object>    {o_uri} ;\n  \
                   <{RD}confidence> \"{conf}\"^^<http://www.w3.org/2001/XMLSchema#double> ;\n  \
                   <{RD}support>    \"1\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n",
                id = Uuid::new_v4().simple(),
                pred = t.predicate.replace('"', "\\\""),
            ));
        }

        let update = format!("INSERT DATA {{ {stmts} }}");
        self.sparql_update(&update).await
    }

    async fn query_facts(&self, query_str: &str, limit: usize) -> Result<Vec<GraphFact>> {
        let q = query_str.replace('"', "\\\"").to_lowercase();
        let sparql = format!(
            "PREFIX rd: <{RD}>\n\
             SELECT ?sub ?pred ?obj ?conf ?sup WHERE {{\n\
               ?rel a rd:Relation ;\n\
                    rd:subject   ?s ;\n\
                    rd:predicate ?pred ;\n\
                    rd:object    ?o ;\n\
                    rd:confidence ?conf ;\n\
                    rd:support    ?sup .\n\
               ?s rd:name ?sub .\n\
               ?o rd:name ?obj .\n\
               FILTER(CONTAINS(LCASE(?sub), \"{q}\") ||\n\
                      CONTAINS(LCASE(?pred), \"{q}\") ||\n\
                      CONTAINS(LCASE(?obj), \"{q}\"))\n\
             }}\n\
             LIMIT {limit}"
        );

        let resp = self.sparql_select(&sparql).await?;
        let mut facts = Vec::new();
        for b in bindings(&resp) {
            facts.push(GraphFact {
                id: Uuid::new_v4().to_string(),
                subject: binding_str(&b["sub"]),
                predicate: binding_str(&b["pred"]),
                object: binding_str(&b["obj"]),
                confidence: binding_str(&b["conf"]).parse::<f32>().unwrap_or(1.0),
                support_count: binding_str(&b["sup"]).parse::<i64>().unwrap_or(1),
                last_seen_at: String::new(),
                evidence: Vec::new(),
            });
        }
        Ok(facts)
    }

    async fn search_entities(&self, query_str: &str, limit: usize) -> Result<Vec<GraphEntity>> {
        let q = query_str.replace('"', "\\\"").to_lowercase();
        let sparql = format!(
            "PREFIX rd: <{RD}>\n\
             SELECT ?name WHERE {{\n\
               ?e a rd:Entity ; rd:name ?name .\n\
               FILTER(CONTAINS(LCASE(?name), \"{q}\"))\n\
             }}\n\
             LIMIT {limit}"
        );

        let resp = self.sparql_select(&sparql).await?;
        let entities = bindings(&resp)
            .into_iter()
            .map(|b| {
                let name = binding_str(&b["name"]);
                GraphEntity {
                    id: normalize(&name),
                    canonical_name: name,
                    entity_type: None,
                    last_seen_at: String::new(),
                }
            })
            .collect();
        Ok(entities)
    }

    async fn get_node(&self, name: &str, limit: usize) -> Result<GraphNode> {
        let entity = GraphEntity {
            id: normalize(name),
            canonical_name: name.to_owned(),
            entity_type: None,
            last_seen_at: String::new(),
        };
        let outgoing = self.query_facts(name, limit).await?;
        Ok(GraphNode {
            entity,
            outgoing,
            incoming: Vec::new(),
        })
    }

    async fn stats(&self) -> Result<GraphStats> {
        let entity_sparql = format!(
            "PREFIX rd: <{RD}>\n\
             SELECT (COUNT(?e) AS ?count) WHERE {{ ?e a rd:Entity . }}"
        );
        let relation_sparql = format!(
            "PREFIX rd: <{RD}>\n\
             SELECT (COUNT(?r) AS ?count) WHERE {{ ?r a rd:Relation . }}"
        );

        let (ent_resp, rel_resp) = tokio::try_join!(
            self.sparql_select(&entity_sparql),
            self.sparql_select(&relation_sparql),
        )?;

        let entities = bindings(&ent_resp)
            .first()
            .and_then(|b| binding_str(&b["count"]).parse::<i64>().ok())
            .unwrap_or(0);
        let relations = bindings(&rel_resp)
            .first()
            .and_then(|b| binding_str(&b["count"]).parse::<i64>().ok())
            .unwrap_or(0);

        Ok(GraphStats {
            sources: 0,
            entities,
            relations,
            evidence: 0,
        })
    }
}
