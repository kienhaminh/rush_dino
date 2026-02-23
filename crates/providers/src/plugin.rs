use std::{collections::HashMap, fs, path::Path};

use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;

use rushdino_common::{AppError, Result};

use crate::types::{ChatChunk, ChatRequest, ChatResponse};

#[derive(Debug, Clone, Deserialize)]
struct PluginManifest {
    name: String,
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body_template: Option<String>,
}

#[derive(Clone)]
pub struct PluginProvider {
    manifest: PluginManifest,
    pub name: String,
    client: reqwest::Client,
}

impl PluginProvider {
    pub fn from_manifest(path: &Path) -> Result<Self> {
        let raw = fs::read_to_string(path)?;
        let manifest: PluginManifest = toml::from_str(&raw)
            .map_err(|e| AppError::Provider(format!("invalid plugin manifest: {e}")))?;

        Ok(Self {
            name: manifest.name.clone(),
            manifest,
            client: reqwest::Client::new(),
        })
    }

    pub async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        let last = request
            .messages
            .iter()
            .rev()
            .find(|m| matches!(m.role, rushdino_common::models::Role::User))
            .map(|m| m.content.clone())
            .unwrap_or_default();

        let template = self
            .manifest
            .body_template
            .clone()
            .unwrap_or_else(|| "{\"message\":\"{{message}}\"}".to_owned());
        let body = template.replace("{{message}}", &last.replace('"', "\\\""));
        let mut req = self
            .client
            .request(
                self.manifest
                    .method
                    .as_deref()
                    .unwrap_or("POST")
                    .parse()
                    .unwrap_or(reqwest::Method::POST),
                &self.manifest.url,
            )
            .body(body)
            .header("content-type", "application/json");

        if let Some(headers) = &self.manifest.headers {
            for (k, v) in headers {
                req = req.header(k, v);
            }
        }

        let text = req
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("plugin request failed: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Provider(format!("plugin status error: {e}")))?
            .text()
            .await
            .map_err(|e| AppError::Provider(format!("plugin parse error: {e}")))?;

        Ok(ChatResponse {
            content: text,
            tool_calls: Vec::new(),
            usage: None,
            finish_reason: "stop".to_owned(),
        })
    }

    pub async fn stream_chat(&self, request: ChatRequest) -> Result<mpsc::Receiver<ChatChunk>> {
        let (tx, rx) = mpsc::channel(1);
        let response = self.chat(request).await?;
        tokio::spawn(async move {
            let _ = tx
                .send(ChatChunk {
                    delta: response.content,
                    tool_calls: Vec::new(),
                    done: false,
                })
                .await;
            let _ = tx
                .send(ChatChunk {
                    delta: String::new(),
                    tool_calls: Vec::new(),
                    done: true,
                })
                .await;
        });
        Ok(rx)
    }

    pub fn manifest_json(&self) -> serde_json::Value {
        json!({
            "name": self.manifest.name,
            "url": self.manifest.url,
            "method": self.manifest.method,
        })
    }
}
