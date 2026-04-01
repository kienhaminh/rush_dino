use std::path::PathBuf;

use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use chrono::Utc;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::tool_registry::Tool;

pub struct ImageTool {
    api_key: Option<String>,
    images_dir: PathBuf,
}

impl ImageTool {
    pub fn new(api_key: Option<String>, images_dir: PathBuf) -> Self {
        Self {
            api_key,
            images_dir,
        }
    }
}

#[async_trait]
impl Tool for ImageTool {
    fn name(&self) -> &str {
        "image"
    }

    fn description(&self) -> &str {
        "Generate an image from a text prompt using Gemini. \
        Saves the result as a PNG under ~/.rushdino/documents/images/ \
        and returns the file path."
    }


    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Image description"
                },
                "filename": {
                    "type": "string",
                    "description": "Output name in snake_case, ≤3 words, no extension (e.g. hero_robot_icon)"
                },
                "resolution": {
                    "type": "string",
                    "enum": ["1K", "2K", "4K"],
                    "description": "Output resolution (default: 1K)"
                },
                "aspect_ratio": {
                    "type": "string",
                    "enum": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
                    "description": "Output aspect ratio (optional; model picks freely if omitted)"
                }
            },
            "required": ["prompt", "filename"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        // 1. Validate API key
        let api_key = self
            .api_key
            .as_deref()
            .map(str::trim)
            .filter(|k| !k.is_empty())
            .ok_or_else(|| AppError::Validation("GEMINI_API_KEY missing".to_owned()))?;

        // 2. Extract required params
        let prompt = args
            .get("prompt")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("prompt is required".to_owned()))?;

        let filename = args
            .get("filename")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("filename is required".to_owned()))?;

        // 3. Validate filename (no path traversal)
        if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
            return Err(AppError::Validation("invalid filename".to_owned()));
        }

        // 4. Validate resolution
        let resolution = args
            .get("resolution")
            .and_then(Value::as_str)
            .unwrap_or("1K");
        if !matches!(resolution, "1K" | "2K" | "4K") {
            return Err(AppError::Validation(format!(
                "invalid resolution: {resolution}"
            )));
        }

        // 5. Validate aspect_ratio
        const VALID_RATIOS: &[&str] = &[
            "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
        ];
        let aspect_ratio = args.get("aspect_ratio").and_then(Value::as_str);
        if let Some(ratio) = aspect_ratio {
            if !VALID_RATIOS.contains(&ratio) {
                return Err(AppError::Validation(format!(
                    "invalid aspect_ratio: {ratio}"
                )));
            }
        }

        // 6. Prepare output path
        std::fs::create_dir_all(&self.images_dir)
            .map_err(|e| AppError::Agent(format!("failed to save image: {e}")))?;

        let timestamp = Utc::now().format("%Y-%m-%d-%H-%M-%S").to_string();
        let output_filename = format!("{timestamp}-{filename}.png");
        let output_path = self.images_dir.join(&output_filename);

        // 7. Build request body
        let mut image_config = json!({ "imageSize": resolution });
        if let Some(ratio) = aspect_ratio {
            image_config["aspectRatio"] = json!(ratio);
        }

        let body = json!({
            "contents": [{ "parts": [{ "text": prompt }] }],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"],
                "imageConfig": image_config
            }
        });

        // 8. Make HTTP request (client created per call, matching web_search pattern)
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key={}",
            api_key
        );

        let client = reqwest::Client::new();
        let response: Value = client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Agent(format!("image request error: {e}")))?
            .error_for_status()
            .map_err(|e| {
                AppError::Agent(format!(
                    "image generation failed: {}",
                    e.status()
                        .map(|s| s.as_str().to_owned())
                        .unwrap_or_else(|| e.to_string())
                ))
            })?
            .json()
            .await
            .map_err(|e| AppError::Agent(format!("image response parse error: {e}")))?;

        // 9. Parse response parts
        let parts = response
            .pointer("/candidates/0/content/parts")
            .and_then(Value::as_array)
            .ok_or_else(|| AppError::Agent("no image returned by model".to_owned()))?;

        let mut text_lines: Vec<String> = Vec::new();
        let mut image_saved = false;

        for part in parts {
            if !image_saved {
                if let Some(text) = part.get("text").and_then(Value::as_str) {
                    text_lines.push(text.to_owned());
                    continue;
                }
            }

            if let Some(inline_data) = part.get("inlineData") {
                let mime = inline_data
                    .get("mimeType")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if !mime.starts_with("image/") {
                    tracing::warn!("image tool: unexpected mimeType '{mime}', skipping part");
                    continue;
                }

                let data_str = inline_data
                    .get("data")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::Agent("inlineData missing data field".to_owned()))?;

                let bytes = BASE64
                    .decode(data_str)
                    .map_err(|e| AppError::Agent(format!("failed to decode image data: {e}")))?;

                std::fs::write(&output_path, &bytes)
                    .map_err(|e| AppError::Agent(format!("failed to save image: {e}")))?;

                image_saved = true;
                break;
            }
        }

        if !image_saved {
            return Err(AppError::Agent("no image returned by model".to_owned()));
        }

        // 10. Build return string
        let mut result = text_lines.join("\n");
        if !result.is_empty() {
            result.push('\n');
        }
        result.push_str(&format!("Image saved: {}", output_path.display()));

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::ImageTool;
    use crate::tool_registry::Tool;
    use serde_json::json;
    use tempfile::tempdir;

    fn tool_with_key(key: &str) -> ImageTool {
        let dir = tempdir().unwrap();
        ImageTool::new(Some(key.to_owned()), dir.path().to_path_buf())
    }

    fn tool_no_key() -> ImageTool {
        let dir = tempdir().unwrap();
        ImageTool::new(None, dir.path().to_path_buf())
    }

    #[tokio::test]
    async fn rejects_missing_api_key() {
        let tool = tool_no_key();
        let err = tool
            .execute(json!({"prompt": "a cat", "filename": "test_cat"}))
            .await;
        assert!(err.is_err());
        let msg = err.unwrap_err().to_string();
        assert!(msg.contains("GEMINI_API_KEY missing"), "got: {msg}");
    }

    #[tokio::test]
    async fn rejects_empty_api_key() {
        let dir = tempdir().unwrap();
        let tool = ImageTool::new(Some("   ".to_owned()), dir.path().to_path_buf());
        let err = tool
            .execute(json!({"prompt": "a cat", "filename": "test_cat"}))
            .await;
        assert!(err.is_err());
        let msg = err.unwrap_err().to_string();
        assert!(msg.contains("GEMINI_API_KEY missing"), "got: {msg}");
    }

    #[tokio::test]
    async fn rejects_filename_with_slash() {
        let tool = tool_with_key("fake-key");
        let err = tool
            .execute(json!({"prompt": "x", "filename": "foo/bar"}))
            .await;
        assert!(err.is_err());
        let msg = err.unwrap_err().to_string();
        assert!(msg.contains("invalid filename"), "got: {msg}");
    }

    #[tokio::test]
    async fn rejects_filename_with_dotdot() {
        let tool = tool_with_key("fake-key");
        let err = tool
            .execute(json!({"prompt": "x", "filename": "../etc/passwd"}))
            .await;
        assert!(err.is_err());
        let msg = err.unwrap_err().to_string();
        assert!(msg.contains("invalid filename"), "got: {msg}");
    }

    #[tokio::test]
    async fn rejects_invalid_resolution() {
        let tool = tool_with_key("fake-key");
        let err = tool
            .execute(json!({"prompt": "x", "filename": "test_img", "resolution": "8K"}))
            .await;
        assert!(err.is_err());
        let msg = err.unwrap_err().to_string();
        assert!(msg.contains("invalid resolution"), "got: {msg}");
    }

    #[tokio::test]
    async fn rejects_invalid_aspect_ratio() {
        let tool = tool_with_key("fake-key");
        let err = tool
            .execute(json!({"prompt": "x", "filename": "test_img", "aspect_ratio": "5:3"}))
            .await;
        assert!(err.is_err());
        let msg = err.unwrap_err().to_string();
        assert!(msg.contains("invalid aspect_ratio"), "got: {msg}");
    }
}
