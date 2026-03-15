use pulldown_cmark::{Event, Parser, Tag, TagEnd};

use rushdino_common::{RichContent, RichContentBlock, TextFormat};

use crate::state::{GatewayAdapterCapabilities, GatewayRichDeliveryMode};

pub fn plain_text_message(text: impl Into<String>) -> RichContent {
    RichContent::plain_text(text)
}

pub fn markdown_message(markdown: impl Into<String>) -> RichContent {
    RichContent::from_markdown(markdown)
}

pub fn render_markdown_message(
    message: &RichContent,
    capabilities: &GatewayAdapterCapabilities,
) -> String {
    render_markdown_with_options(message, capabilities, false)
}

pub fn render_markdown_fallback_message(
    message: &RichContent,
    capabilities: &GatewayAdapterCapabilities,
) -> String {
    render_markdown_with_options(message, capabilities, true)
}

pub fn render_html_message(
    message: &RichContent,
    capabilities: &GatewayAdapterCapabilities,
) -> String {
    render_html_with_options(message, capabilities, false)
}

pub fn render_html_fallback_message(
    message: &RichContent,
    capabilities: &GatewayAdapterCapabilities,
) -> String {
    render_html_with_options(message, capabilities, true)
}

fn render_markdown_with_options(
    message: &RichContent,
    capabilities: &GatewayAdapterCapabilities,
    force_degraded_rich_blocks: bool,
) -> String {
    if !capabilities.markdown {
        return message.fallback_text.clone();
    }

    let rendered = message
        .blocks
        .iter()
        .map(|block| render_markdown_block(block, capabilities, force_degraded_rich_blocks))
        .filter(|block| !block.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    if rendered.trim().is_empty() {
        message.fallback_text.clone()
    } else {
        rendered
    }
}

fn render_html_with_options(
    message: &RichContent,
    capabilities: &GatewayAdapterCapabilities,
    force_degraded_rich_blocks: bool,
) -> String {
    let rendered = message
        .blocks
        .iter()
        .map(|block| render_html_block(block, capabilities, force_degraded_rich_blocks))
        .filter(|block| !block.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    if rendered.trim().is_empty() {
        escape_html_text(&message.fallback_text)
    } else {
        rendered
    }
}

pub fn render_plain_text_block(block: &RichContentBlock) -> String {
    match block {
        RichContentBlock::FormattedText { text, format } => match format {
            TextFormat::PlainText => text.clone(),
            TextFormat::Markdown => markdown_to_plain_text(text),
        },
        RichContentBlock::CodeBlock { code, language } => {
            if let Some(language) = language {
                format!("[{language}]\n{code}")
            } else {
                code.clone()
            }
        }
        RichContentBlock::LinkList { items } => items
            .iter()
            .map(|item| format!("- {}: {}", item.label, item.url))
            .collect::<Vec<_>>()
            .join("\n"),
        RichContentBlock::Image { url, alt } => alt
            .as_ref()
            .map(|alt| format!("Image: {} ({})", alt, url))
            .unwrap_or_else(|| format!("Image: {url}")),
        RichContentBlock::LinkButtons { items } => items
            .iter()
            .map(|item| format!("{}: {}", item.label, item.url))
            .collect::<Vec<_>>()
            .join("\n"),
    }
}

fn render_markdown_block(
    block: &RichContentBlock,
    capabilities: &GatewayAdapterCapabilities,
    force_degraded_rich_blocks: bool,
) -> String {
    match block {
        RichContentBlock::FormattedText { text, .. } => text.clone(),
        RichContentBlock::CodeBlock { code, language } => {
            if capabilities.code_blocks {
                let language = language.clone().unwrap_or_default();
                format!("```{language}\n{code}\n```")
            } else {
                render_plain_text_block(block)
            }
        }
        RichContentBlock::LinkList { items } => items
            .iter()
            .map(|item| format!("- [{}]({})", item.label, item.url))
            .collect::<Vec<_>>()
            .join("\n"),
        RichContentBlock::Image { url, alt } => {
            if supports_native_rich_block(capabilities.images, force_degraded_rich_blocks) {
                format!(
                    "![{}]({})",
                    alt.clone().unwrap_or_else(|| "image".to_owned()),
                    url
                )
            } else {
                render_plain_text_block(block)
            }
        }
        RichContentBlock::LinkButtons { items } => {
            if supports_native_rich_block(capabilities.link_buttons, force_degraded_rich_blocks) {
                items
                    .iter()
                    .map(|item| format!("[{}]({})", item.label, item.url))
                    .collect::<Vec<_>>()
                    .join(" · ")
            } else {
                items
                    .iter()
                    .map(|item| format!("{}: {}", item.label, item.url))
                    .collect::<Vec<_>>()
                    .join("\n")
            }
        }
    }
}

fn render_html_block(
    block: &RichContentBlock,
    capabilities: &GatewayAdapterCapabilities,
    force_degraded_rich_blocks: bool,
) -> String {
    match block {
        RichContentBlock::FormattedText { text, .. } => markdown_to_html(text),
        RichContentBlock::CodeBlock { code, language } => {
            if capabilities.code_blocks {
                if let Some(language) = language {
                    format!(
                        "<pre><code class=\"language-{}\">{}</code></pre>",
                        escape_html_text(language),
                        escape_html_text(code)
                    )
                } else {
                    format!("<pre><code>{}</code></pre>", escape_html_text(code))
                }
            } else {
                escape_html_text(code)
            }
        }
        RichContentBlock::LinkList { items } => items
            .iter()
            .map(|item| {
                format!(
                    "• <a href=\"{}\">{}</a>",
                    escape_html_text(&item.url),
                    escape_html_text(&item.label)
                )
            })
            .collect::<Vec<_>>()
            .join("\n"),
        RichContentBlock::Image { url, alt } => {
            if supports_native_rich_block(capabilities.images, force_degraded_rich_blocks) {
                format!(
                    "<a href=\"{}\">{}</a>",
                    escape_html_text(url),
                    escape_html_text(alt.as_deref().unwrap_or(url))
                )
            } else {
                escape_html_text(url)
            }
        }
        RichContentBlock::LinkButtons { items } => {
            if supports_native_rich_block(capabilities.link_buttons, force_degraded_rich_blocks) {
                items
                    .iter()
                    .map(|item| {
                        format!(
                            "<a href=\"{}\">{}</a>",
                            escape_html_text(&item.url),
                            escape_html_text(&item.label)
                        )
                    })
                    .collect::<Vec<_>>()
                    .join(" | ")
            } else {
                items
                    .iter()
                    .map(|item| {
                        format!(
                            "{}: {}",
                            escape_html_text(&item.label),
                            escape_html_text(&item.url)
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            }
        }
    }
}

fn supports_native_rich_block(
    mode: GatewayRichDeliveryMode,
    force_degraded_rich_blocks: bool,
) -> bool {
    !force_degraded_rich_blocks && matches!(mode, GatewayRichDeliveryMode::Native)
}

fn markdown_to_plain_text(markdown: &str) -> String {
    let mut text = String::new();
    for event in Parser::new(markdown) {
        match event {
            Event::Text(value) | Event::Code(value) => text.push_str(&value),
            Event::SoftBreak | Event::HardBreak => text.push('\n'),
            Event::Rule => text.push_str("\n---\n"),
            Event::Start(Tag::Item) => text.push_str("• "),
            Event::End(TagEnd::Item) => text.push('\n'),
            Event::End(TagEnd::Paragraph)
            | Event::End(TagEnd::Heading(_))
            | Event::End(TagEnd::CodeBlock)
            | Event::End(TagEnd::List(_))
            | Event::End(TagEnd::BlockQuote(_)) => text.push_str("\n\n"),
            _ => {}
        }
    }
    text.trim().to_owned()
}

fn markdown_to_html(markdown: &str) -> String {
    let parser = Parser::new(markdown);
    let mut html = String::new();
    let mut list_stack = Vec::new();

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::Heading { .. } => html.push_str("<b>"),
                Tag::BlockQuote(_) => html.push_str("<blockquote>"),
                Tag::CodeBlock(kind) => {
                    html.push_str("<pre>");
                    if let pulldown_cmark::CodeBlockKind::Fenced(lang) = kind {
                        if !lang.is_empty() {
                            html.push_str(&format!(
                                "<code class=\"language-{}\">",
                                escape_html_text(&lang)
                            ));
                        } else {
                            html.push_str("<code>");
                        }
                    } else {
                        html.push_str("<code>");
                    }
                }
                Tag::List(start) => {
                    list_stack.push(start);
                }
                Tag::Item => match list_stack.last_mut() {
                    Some(Some(num)) => {
                        html.push_str(&format!("{}. ", num));
                        *num += 1;
                    }
                    Some(None) | None => html.push_str("• "),
                },
                Tag::Strong => html.push_str("<b>"),
                Tag::Emphasis => html.push_str("<i>"),
                Tag::Strikethrough => html.push_str("<s>"),
                Tag::Link { dest_url, .. } => {
                    html.push_str(&format!("<a href=\"{}\">", escape_html_text(&dest_url)));
                }
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Paragraph => html.push_str("\n\n"),
                TagEnd::Heading(_) => html.push_str("</b>\n\n"),
                TagEnd::BlockQuote(_) => html.push_str("</blockquote>\n\n"),
                TagEnd::CodeBlock => html.push_str("</code></pre>\n\n"),
                TagEnd::List(_) => {
                    list_stack.pop();
                    html.push('\n');
                }
                TagEnd::Item => html.push('\n'),
                TagEnd::Strong => html.push_str("</b>"),
                TagEnd::Emphasis => html.push_str("</i>"),
                TagEnd::Strikethrough => html.push_str("</s>"),
                TagEnd::Link => html.push_str("</a>"),
                _ => {}
            },
            Event::Text(value) => html.push_str(&escape_html_text(&value)),
            Event::Code(value) => {
                html.push_str("<code>");
                html.push_str(&escape_html_text(&value));
                html.push_str("</code>");
            }
            Event::Html(value) => html.push_str(&escape_html_text(&value)),
            Event::SoftBreak => html.push('\n'),
            Event::HardBreak => html.push('\n'),
            Event::Rule => html.push_str("\n---\n\n"),
            _ => {}
        }
    }

    html.trim().to_owned()
}

fn escape_html_text(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use rushdino_common::RichContentBlock;

    use super::{
        markdown_message, render_html_fallback_message, render_markdown_fallback_message,
        render_markdown_message,
    };
    use crate::state::{GatewayAdapterCapabilities, GatewayRichDeliveryMode};

    #[test]
    fn parses_markdown_into_structured_blocks() {
        let message = markdown_message(
            "Hello **world**\n\n```rust\nfn main() {}\n```\n\n- [Docs](https://example.com/docs)\n- [API](https://example.com/api)\n\n![Diagram](https://example.com/diagram.png)\n\n[Open console](https://example.com/console)",
        );

        assert_eq!(message.blocks.len(), 5);
        assert!(matches!(
            message.blocks[0],
            RichContentBlock::FormattedText { .. }
        ));
        assert!(matches!(
            message.blocks[1],
            RichContentBlock::CodeBlock { .. }
        ));
        assert!(matches!(
            message.blocks[2],
            RichContentBlock::LinkList { .. }
        ));
        assert!(matches!(message.blocks[3], RichContentBlock::Image { .. }));
        assert!(matches!(
            message.blocks[4],
            RichContentBlock::LinkButtons { .. }
        ));
        assert!(message
            .fallback_text
            .contains("Docs: https://example.com/docs"));
        assert!(message
            .fallback_text
            .contains("Diagram: https://example.com/diagram.png"));
    }

    #[test]
    fn degrades_unsupported_blocks_in_markdown_render() {
        let message = markdown_message(
            "![Diagram](https://example.com/diagram.png)\n\n[Open console](https://example.com/console)",
        );
        let capabilities = GatewayAdapterCapabilities {
            plain_text: true,
            markdown: true,
            code_blocks: true,
            images: GatewayRichDeliveryMode::Unsupported,
            link_buttons: GatewayRichDeliveryMode::Unsupported,
        };

        let rendered = render_markdown_message(&message, &capabilities);
        assert!(rendered.contains("Image: Diagram"));
        assert!(rendered.contains("Open console: https://example.com/console"));
    }

    #[test]
    fn forced_fallback_ignores_native_capabilities() {
        let message = markdown_message(
            "![Diagram](https://example.com/diagram.png)\n\n[Open console](https://example.com/console)",
        );
        let capabilities = GatewayAdapterCapabilities {
            plain_text: true,
            markdown: true,
            code_blocks: true,
            images: GatewayRichDeliveryMode::Native,
            link_buttons: GatewayRichDeliveryMode::Native,
        };

        let rendered = render_markdown_fallback_message(&message, &capabilities);
        assert!(rendered.contains("Image: Diagram"));
        assert!(rendered.contains("Open console: https://example.com/console"));

        let html = render_html_fallback_message(&message, &capabilities);
        assert!(html.contains("https://example.com/diagram.png"));
        assert!(html.contains("Open console: https://example.com/console"));
    }
}
