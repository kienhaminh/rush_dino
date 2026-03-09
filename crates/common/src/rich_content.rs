use pulldown_cmark::{Event, Parser, Tag, TagEnd};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RichContent {
    pub fallback_text: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blocks: Vec<RichContentBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RichContentBlock {
    FormattedText {
        text: String,
        format: TextFormat,
    },
    CodeBlock {
        code: String,
        language: Option<String>,
    },
    LinkList {
        items: Vec<LinkTarget>,
    },
    Image {
        url: String,
        alt: Option<String>,
    },
    LinkButtons {
        items: Vec<LinkTarget>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TextFormat {
    PlainText,
    Markdown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LinkTarget {
    pub label: String,
    pub url: String,
}

impl RichContent {
    pub fn plain_text(text: impl Into<String>) -> Self {
        let text = text.into();
        Self {
            fallback_text: text.clone(),
            blocks: if text.trim().is_empty() {
                Vec::new()
            } else {
                vec![RichContentBlock::FormattedText {
                    text,
                    format: TextFormat::PlainText,
                }]
            },
        }
    }

    pub fn from_tool_value(value: &Value) -> Result<Self> {
        let rich_content = serde_json::from_value::<Self>(value.clone())
            .map_err(|err| AppError::Validation(format!("invalid rich content payload: {err}")))?;
        rich_content.validate()?;
        Ok(rich_content)
    }

    pub fn from_markdown(markdown: impl Into<String>) -> Self {
        let markdown = markdown.into().trim().to_owned();
        if markdown.is_empty() {
            return Self::plain_text(String::new());
        }

        let blocks = parse_blocks(&markdown);
        let fallback_text = render_blocks_as_plain_text(&blocks);

        Self {
            fallback_text: if fallback_text.trim().is_empty() {
                markdown_to_plain_text(&markdown)
            } else {
                fallback_text
            },
            blocks,
        }
    }

    pub fn validate(&self) -> Result<()> {
        if self.fallback_text.trim().is_empty() {
            return Err(AppError::Validation("fallback_text is required".to_owned()));
        }

        if self.blocks.is_empty() {
            return Err(AppError::Validation(
                "rich content requires at least one block".to_owned(),
            ));
        }

        for block in &self.blocks {
            match block {
                RichContentBlock::FormattedText { text, .. } => {
                    if text.trim().is_empty() {
                        return Err(AppError::Validation(
                            "formatted_text block cannot be empty".to_owned(),
                        ));
                    }
                }
                RichContentBlock::CodeBlock { code, .. } => {
                    if code.trim().is_empty() {
                        return Err(AppError::Validation(
                            "code_block block cannot be empty".to_owned(),
                        ));
                    }
                }
                RichContentBlock::LinkList { items } => {
                    validate_link_targets(items, false)?;
                }
                RichContentBlock::Image { url, .. } => {
                    validate_http_url(url)?;
                }
                RichContentBlock::LinkButtons { items } => {
                    validate_link_targets(items, true)?;
                    if items.len() > 3 {
                        return Err(AppError::Validation(
                            "link_buttons supports at most 3 buttons".to_owned(),
                        ));
                    }
                }
            }
        }

        Ok(())
    }
}

fn validate_link_targets(items: &[LinkTarget], is_button_row: bool) -> Result<()> {
    if items.is_empty() {
        let label = if is_button_row {
            "link_buttons"
        } else {
            "link_list"
        };
        return Err(AppError::Validation(format!(
            "{label} requires at least one item"
        )));
    }

    for item in items {
        if item.label.trim().is_empty() {
            return Err(AppError::Validation(
                "link target label cannot be empty".to_owned(),
            ));
        }
        validate_http_url(&item.url)?;
    }

    Ok(())
}

fn validate_http_url(url: &str) -> Result<()> {
    if url.starts_with("http://") || url.starts_with("https://") {
        Ok(())
    } else {
        Err(AppError::Validation(format!(
            "only http/https URLs are supported: {url}"
        )))
    }
}

fn parse_blocks(markdown: &str) -> Vec<RichContentBlock> {
    let mut blocks = Vec::new();
    let mut paragraph_lines = Vec::new();
    let lines = markdown.lines().collect::<Vec<_>>();
    let mut index = 0;

    while index < lines.len() {
        let line = lines[index];
        let trimmed = line.trim();

        if trimmed.starts_with("```") {
            flush_paragraph(&mut paragraph_lines, &mut blocks);
            let language = trimmed.trim_start_matches("```").trim().to_owned();
            index += 1;
            let mut code_lines = Vec::new();
            while index < lines.len() && !lines[index].trim().starts_with("```") {
                code_lines.push(lines[index]);
                index += 1;
            }
            blocks.push(RichContentBlock::CodeBlock {
                code: code_lines.join("\n").trim_end().to_owned(),
                language: if language.is_empty() {
                    None
                } else {
                    Some(language)
                },
            });
            if index < lines.len() {
                index += 1;
            }
            continue;
        }

        if let Some((alt, url)) = parse_image_line(trimmed) {
            flush_paragraph(&mut paragraph_lines, &mut blocks);
            blocks.push(RichContentBlock::Image { url, alt });
            index += 1;
            continue;
        }

        if let Some(items) = collect_bullet_link_lines(&lines, &mut index) {
            flush_paragraph(&mut paragraph_lines, &mut blocks);
            blocks.push(RichContentBlock::LinkList { items });
            continue;
        }

        if let Some(items) = collect_button_link_lines(&lines, &mut index) {
            flush_paragraph(&mut paragraph_lines, &mut blocks);
            blocks.push(RichContentBlock::LinkButtons { items });
            continue;
        }

        paragraph_lines.push(line.to_owned());
        index += 1;
    }

    flush_paragraph(&mut paragraph_lines, &mut blocks);
    blocks
}

fn collect_bullet_link_lines(lines: &[&str], index: &mut usize) -> Option<Vec<LinkTarget>> {
    let mut cursor = *index;
    let mut items = Vec::new();

    while cursor < lines.len() {
        let trimmed = lines[cursor].trim();
        let Some(item) = parse_bullet_link_line(trimmed) else {
            break;
        };
        items.push(item);
        cursor += 1;
    }

    if items.is_empty() {
        None
    } else {
        *index = cursor;
        Some(items)
    }
}

fn collect_button_link_lines(lines: &[&str], index: &mut usize) -> Option<Vec<LinkTarget>> {
    let mut cursor = *index;
    let mut items = Vec::new();

    while cursor < lines.len() {
        let trimmed = lines[cursor].trim();
        let Some(item) = parse_standalone_link_line(trimmed) else {
            break;
        };
        items.push(item);
        cursor += 1;
    }

    if items.is_empty() {
        None
    } else {
        *index = cursor;
        Some(items)
    }
}

fn flush_paragraph(lines: &mut Vec<String>, blocks: &mut Vec<RichContentBlock>) {
    let text = lines.join("\n").trim().to_owned();
    lines.clear();
    if text.is_empty() {
        return;
    }
    blocks.push(RichContentBlock::FormattedText {
        text,
        format: TextFormat::Markdown,
    });
}

fn parse_image_line(line: &str) -> Option<(Option<String>, String)> {
    if let Some(inner) = line.strip_prefix("![") {
        let (alt, rest) = inner.split_once("](")?;
        let url = rest.strip_suffix(')')?.trim();
        if url.starts_with("http://") || url.starts_with("https://") {
            let alt = alt.trim();
            return Some((
                if alt.is_empty() {
                    None
                } else {
                    Some(alt.to_owned())
                },
                url.to_owned(),
            ));
        }
    }

    if is_image_url(line) {
        return Some((None, line.to_owned()));
    }

    None
}

fn parse_bullet_link_line(line: &str) -> Option<LinkTarget> {
    let candidate = line
        .strip_prefix("- ")
        .or_else(|| line.strip_prefix("* "))?;
    parse_link_target(candidate.trim())
}

fn parse_standalone_link_line(line: &str) -> Option<LinkTarget> {
    parse_link_target(line)
}

fn parse_link_target(line: &str) -> Option<LinkTarget> {
    if let Some(inner) = line.strip_prefix('[') {
        let (label, rest) = inner.split_once("](")?;
        let url = rest.strip_suffix(')')?.trim();
        if url.starts_with("http://") || url.starts_with("https://") {
            return Some(LinkTarget {
                label: label.trim().to_owned(),
                url: url.to_owned(),
            });
        }
    }

    if line.starts_with("http://") || line.starts_with("https://") {
        return Some(LinkTarget {
            label: line.to_owned(),
            url: line.to_owned(),
        });
    }

    None
}

fn render_blocks_as_plain_text(blocks: &[RichContentBlock]) -> String {
    blocks
        .iter()
        .map(render_plain_text_block)
        .filter(|block| !block.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn render_plain_text_block(block: &RichContentBlock) -> String {
    match block {
        RichContentBlock::FormattedText { text, format } => match format {
            TextFormat::PlainText => text.clone(),
            TextFormat::Markdown => markdown_to_plain_text(text),
        },
        RichContentBlock::CodeBlock { code, language } => {
            if let Some(language) = language {
                format!("```{language}\n{code}\n```")
            } else {
                format!("```\n{code}\n```")
            }
        }
        RichContentBlock::LinkList { items } => items
            .iter()
            .map(|item| format!("- {}: {}", item.label, item.url))
            .collect::<Vec<_>>()
            .join("\n"),
        RichContentBlock::Image { url, alt } => alt
            .as_ref()
            .map(|text| format!("{text}: {url}"))
            .unwrap_or_else(|| url.clone()),
        RichContentBlock::LinkButtons { items } => items
            .iter()
            .map(|item| format!("{}: {}", item.label, item.url))
            .collect::<Vec<_>>()
            .join(" | "),
    }
}

fn markdown_to_plain_text(markdown: &str) -> String {
    let parser = Parser::new(markdown);
    let mut out = String::new();

    for event in parser {
        match event {
            Event::Text(text) | Event::Code(text) => out.push_str(&text),
            Event::SoftBreak | Event::HardBreak => out.push('\n'),
            Event::Start(Tag::Item) => {
                if !out.ends_with('\n') && !out.is_empty() {
                    out.push('\n');
                }
                out.push_str("- ");
            }
            Event::End(TagEnd::Paragraph)
            | Event::End(TagEnd::Heading(_))
            | Event::End(TagEnd::BlockQuote(_))
            | Event::End(TagEnd::List(_))
            | Event::End(TagEnd::Item) => {
                if !out.ends_with('\n') {
                    out.push('\n');
                }
            }
            _ => {}
        }
    }

    out.lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned()
}

fn is_image_url(url: &str) -> bool {
    let normalized = url.trim().to_ascii_lowercase();
    (normalized.starts_with("http://") || normalized.starts_with("https://"))
        && [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]
            .iter()
            .any(|suffix| normalized.ends_with(suffix))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{RichContent, RichContentBlock, TextFormat};

    #[test]
    fn rejects_empty_blocks() {
        let result = RichContent::from_tool_value(&json!({
            "fallbackText": "Hello",
            "blocks": [],
        }));
        assert!(result.is_err());
    }

    #[test]
    fn rejects_non_http_urls() {
        let result = RichContent::from_tool_value(&json!({
            "fallbackText": "Hello",
            "blocks": [
                {
                    "type": "image",
                    "url": "file:///tmp/nope.png"
                }
            ]
        }));
        assert!(result.is_err());
    }

    #[test]
    fn validates_rich_payloads() {
        let rich_content = RichContent::from_tool_value(&json!({
            "fallbackText": "Read the guide",
            "blocks": [
                {
                    "type": "formatted_text",
                    "text": "## Read the guide",
                    "format": "markdown"
                },
                {
                    "type": "link_buttons",
                    "items": [
                        {
                            "label": "Open docs",
                            "url": "https://example.com/docs"
                        }
                    ]
                }
            ]
        }))
        .expect("payload should be valid");

        assert_eq!(rich_content.fallback_text, "Read the guide");
        assert!(matches!(
            rich_content.blocks[0],
            RichContentBlock::FormattedText {
                format: TextFormat::Markdown,
                ..
            }
        ));
    }
}
