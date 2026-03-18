use async_trait::async_trait;
use reqwest::Client;
use serde_json::Value;

use rushdino_common::{AppError, KnowledgeGraphAccess, Result};

/// HTTP client that implements `KnowledgeGraphAccess` against a remote
/// RushDino instance via its `/api/graph/*` endpoints.
pub struct RemoteKgClient {
    base_url: String,
    api_key: Option<String>,
    client: Client,
}

impl RemoteKgClient {
    pub fn new(base_url: String, api_key: Option<String>) -> Self {
        Self {
            base_url,
            api_key,
            client: Client::new(),
        }
    }

    fn add_auth<B>(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if let Some(key) = &self.api_key {
            req.header("Authorization", format!("Bearer {key}"))
        } else {
            req
        }
    }
}

#[async_trait]
impl KnowledgeGraphAccess for RemoteKgClient {
    async fn ingest_text(&self, source_type: &str, source_ref: &str, text: &str) -> Result<()> {
        let url = format!("{}/api/graph/ingest", self.base_url);
        let body = serde_json::json!({
            "source_type": source_type,
            "source_ref": source_ref,
            "text": text,
        });
        let req = self.client.post(&url).json(&body);
        let resp = self
            .add_auth::<()>(req)
            .send()
            .await
            .map_err(|e| AppError::Validation(format!("remote KG ingest request failed: {e}")))?;

        if resp.status().is_success() {
            Ok(())
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Err(AppError::Validation(format!(
                "remote KG ingest error {status}: {body}"
            )))
        }
    }

    async fn facts_for_prompt(
        &self,
        query: &str,
        _conversation_id: Option<&str>,
        max_facts: usize,
    ) -> Result<Vec<String>> {
        let url = format!("{}/api/graph/facts", self.base_url);
        let req = self
            .client
            .get(&url)
            .query(&[("q", query), ("limit", &max_facts.to_string())]);
        let resp = self
            .add_auth::<()>(req)
            .send()
            .await
            .map_err(|e| AppError::Validation(format!("remote KG facts request failed: {e}")))?;

        if !resp.status().is_success() {
            return Err(AppError::Validation(format!(
                "remote KG facts error: {}",
                resp.status()
            )));
        }

        let val: Value = resp
            .json()
            .await
            .map_err(|e| AppError::Validation(format!("remote KG facts parse failed: {e}")))?;

        let items = val
            .get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        Ok(items
            .into_iter()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect())
    }

    async fn facts_as_json(&self, query: &str, limit: usize) -> Result<Value> {
        let url = format!("{}/api/graph/facts", self.base_url);
        let req = self
            .client
            .get(&url)
            .query(&[("q", query), ("limit", &limit.to_string())]);
        let resp = self
            .add_auth::<()>(req)
            .send()
            .await
            .map_err(|e| AppError::Validation(format!("remote KG request failed: {e}")))?;

        if !resp.status().is_success() {
            return Err(AppError::Validation(format!(
                "remote KG error: {}",
                resp.status()
            )));
        }

        resp.json()
            .await
            .map_err(|e| AppError::Validation(format!("remote KG response parse failed: {e}")))
    }
}
