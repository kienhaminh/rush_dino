// crates/cli/src/api_client.rs
use reqwest::Client;
use rushdino_common::{AppConfig, AppError, Result};
use serde_json::Value;

pub struct ApiClient {
    client: Client,
    base_url: String,
}

impl ApiClient {
    #[allow(clippy::new_without_default)]
    pub fn new() -> Result<Self> {
        let config = AppConfig::load()?;
        let base_url = format!("http://{}:{}", config.host, config.port);
        Ok(Self {
            client: Client::new(),
            base_url,
        })
    }

    pub async fn get(&self, path: &str) -> Result<Value> {
        let url = format!("{}{}", self.base_url, path);
        let res = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| AppError::Agent(format!("Request failed: {e}")))?;
        self.parse_response(res).await
    }

    pub async fn post(&self, path: &str, body: Value) -> Result<Value> {
        let url = format!("{}{}", self.base_url, path);
        let res = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Agent(format!("Request failed: {e}")))?;
        self.parse_response(res).await
    }

    pub async fn delete(&self, path: &str) -> Result<Value> {
        let url = format!("{}{}", self.base_url, path);
        let res = self
            .client
            .delete(&url)
            .send()
            .await
            .map_err(|e| AppError::Agent(format!("Request failed: {e}")))?;
        self.parse_response(res).await
    }

    async fn parse_response(&self, res: reqwest::Response) -> Result<Value> {
        if res.status().is_success() {
            if res.status() == reqwest::StatusCode::NO_CONTENT
                || res.content_length() == Some(0)
            {
                return Ok(Value::Null);
            }
            res.json::<Value>()
                .await
                .map_err(|e| AppError::Agent(format!("Failed to parse response: {e}")))
        } else {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            Err(AppError::Agent(format!("Server error {status}: {body}")))
        }
    }
}
