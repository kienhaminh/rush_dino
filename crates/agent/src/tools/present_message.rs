use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{Result, RichContent};

use crate::tool_registry::Tool;

pub struct PresentMessageTool;

impl PresentMessageTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for PresentMessageTool {
    fn name(&self) -> &str {
        "present_message"
    }

    fn description(&self) -> &str {
        "Attach a structured presentation payload to the final assistant message"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "fallbackText": {
                    "type": "string",
                    "description": "Required plain-text fallback that older clients can display."
                },
                "blocks": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": ["formatted_text", "code_block", "link_list", "image", "link_buttons"]
                            }
                        },
                        "required": ["type"]
                    }
                }
            },
            "required": ["fallbackText", "blocks"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let rich_content = RichContent::from_tool_value(&args)?;
        Ok(format!(
            "structured presentation accepted with {} blocks",
            rich_content.blocks.len()
        ))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::PresentMessageTool;
    use crate::tool_registry::Tool;

    #[tokio::test]
    async fn rejects_invalid_urls() {
        let tool = PresentMessageTool::new();
        let result = tool
            .execute(json!({
                "fallbackText": "Bad image",
                "blocks": [
                    {
                        "type": "image",
                        "url": "file:///tmp/image.png"
                    }
                ]
            }))
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn accepts_valid_payload() {
        let tool = PresentMessageTool::new();
        let result = tool
            .execute(json!({
                "fallbackText": "Open docs",
                "blocks": [
                    {
                        "type": "link_buttons",
                        "items": [
                            {
                                "label": "Docs",
                                "url": "https://example.com/docs"
                            }
                        ]
                    }
                ]
            }))
            .await
            .expect("tool should validate payload");

        assert!(result.contains("structured presentation accepted"));
    }
}
