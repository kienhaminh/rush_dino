#![allow(dead_code)]
//! HTTP client for the RushDino server with HMAC-signed requests.

use anyhow::{Context, Result};
use serde::de::DeserializeOwned;

use crate::signer;

#[derive(Clone)]
pub struct ApiClient {
    base_url: String,
    secret: Vec<u8>,
    http: reqwest::Client,
}

impl ApiClient {
    pub fn new(base_url: impl Into<String>, secret_hex: &str) -> Self {
        Self {
            base_url: base_url.into(),
            secret: decode_secret(secret_hex),
            http: reqwest::Client::new(),
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub fn secret(&self) -> &[u8] {
        &self.secret
    }

    /// Signed `Authorization` header value for the WebSocket upgrade request.
    pub fn ws_authorization(&self, path: &str) -> String {
        signer::authorization(&self.secret, "GET", path, b"")
    }

    pub async fn get_json(&self, path: &str) -> Result<serde_json::Value> {
        self.request_json("GET", path, None).await
    }

    pub async fn post_json(
        &self,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<serde_json::Value> {
        self.request_json("POST", path, body).await
    }

    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let value = self.get_json(path).await?;
        Ok(serde_json::from_value(value)?)
    }

    async fn request_json(
        &self,
        method: &str,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<serde_json::Value> {
        // Sign over the URL path + query only.
        let sign_path = path_and_query(path);

        let mut req = match method {
            "POST" => self.http.post(format!("{}{path}", self.base_url)),
            _ => self.http.get(format!("{}{path}", self.base_url)),
        };
        let encoded_body = body
            .map(|b| serde_json::to_vec(b).context("encode request body"))
            .transpose()?
            .unwrap_or_default();
        if body.is_some() {
            req = req.header("Content-Type", "application/json");
        }
        req = req.header(
            "Authorization",
            signer::authorization(&self.secret, method, &sign_path, &encoded_body),
        );

        let response = req.timeout(std::time::Duration::from_secs(30)).send().await?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            anyhow::bail!("Server returned {status}: {text}");
        }
        Ok(serde_json::from_str(&text).unwrap_or(serde_json::Value::Null))
    }
}

fn decode_secret(hex_secret: &str) -> Vec<u8> {
    (0..hex_secret.len() / 2)
        .filter_map(|i| u8::from_str_radix(&hex_secret[i * 2..i * 2 + 2], 16).ok())
        .collect()
}

fn path_and_query(path: &str) -> String {
    match path.split_once('?') {
        Some((p, q)) => format!("{p}?{q}"),
        None => path.to_string(),
    }
}
