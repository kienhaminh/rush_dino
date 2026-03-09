use rushdino_common::{LinkTarget, RichContent, RichContentBlock};
use rushdino_gateway::{
    rich_message::{render_markdown_fallback_message, render_plain_text_block},
    GatewayAdapterCapabilities,
};
use serde_json::{json, Value};

const SLACK_MAX_BUTTONS: usize = 5;
const SLACK_SECTION_TEXT_LIMIT: usize = 3000;

#[derive(Debug, Clone)]
pub enum SlackDeliveryPlan {
    TextOnly { text: String },
    Native { text: String, blocks: Vec<Value> },
    Degraded { text: String, reason: String },
}

pub fn plan_delivery(
    message: &RichContent,
    capabilities: &GatewayAdapterCapabilities,
) -> SlackDeliveryPlan {
    let degraded_text = render_markdown_fallback_message(message, capabilities);
    let mut image_block: Option<(String, String)> = None;
    let mut button_items: Option<Vec<LinkTarget>> = None;

    for block in &message.blocks {
        match block {
            RichContentBlock::Image { url, alt } => {
                if image_block.is_some() {
                    return SlackDeliveryPlan::Degraded {
                        text: degraded_text,
                        reason: "slack native delivery degraded: only one image block is supported"
                            .to_owned(),
                    };
                }
                image_block = Some((
                    url.clone(),
                    alt.clone().unwrap_or_else(|| "image".to_owned()),
                ));
            }
            RichContentBlock::LinkButtons { items } => {
                if button_items.is_some() {
                    return SlackDeliveryPlan::Degraded {
                        text: degraded_text,
                        reason: "slack native delivery degraded: only one link_buttons block is supported".to_owned(),
                    };
                }
                if items.len() > SLACK_MAX_BUTTONS {
                    return SlackDeliveryPlan::Degraded {
                        text: degraded_text,
                        reason: format!(
                            "slack native delivery degraded: only {SLACK_MAX_BUTTONS} buttons fit in one actions block"
                        ),
                    };
                }
                button_items = Some(items.clone());
            }
            _ => {}
        }
    }

    if image_block.is_none() && button_items.is_none() {
        return SlackDeliveryPlan::TextOnly {
            text: degraded_text,
        };
    }

    let text_without_native = message_without_blocks(message, |block| {
        !matches!(
            block,
            RichContentBlock::Image { .. } | RichContentBlock::LinkButtons { .. }
        )
    });
    let section_text = render_markdown_fallback_message(&text_without_native, capabilities);
    if section_text.len() > SLACK_SECTION_TEXT_LIMIT {
        return SlackDeliveryPlan::Degraded {
            text: degraded_text,
            reason: format!(
                "slack native delivery degraded: section text exceeded {SLACK_SECTION_TEXT_LIMIT} characters"
            ),
        };
    }

    let mut blocks = Vec::new();
    if !section_text.trim().is_empty() {
        blocks.push(json!({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": section_text,
            }
        }));
    }
    if let Some((image_url, alt_text)) = image_block {
        blocks.push(json!({
            "type": "image",
            "image_url": image_url,
            "alt_text": alt_text,
        }));
    }
    if let Some(items) = button_items {
        blocks.push(json!({
            "type": "actions",
            "elements": items
                .into_iter()
                .map(|item| {
                    json!({
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": item.label,
                        },
                        "url": item.url,
                    })
                })
                .collect::<Vec<_>>(),
        }));
    }

    SlackDeliveryPlan::Native {
        text: message.fallback_text.clone(),
        blocks,
    }
}

fn message_without_blocks(
    message: &RichContent,
    include: impl Fn(&RichContentBlock) -> bool,
) -> RichContent {
    let blocks = message
        .blocks
        .iter()
        .filter(|block| include(block))
        .cloned()
        .collect::<Vec<_>>();
    let fallback_text = blocks
        .iter()
        .map(render_plain_text_block)
        .filter(|block| !block.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    RichContent {
        fallback_text,
        blocks,
    }
}

#[cfg(test)]
mod tests {
    use rushdino_common::{LinkTarget, RichContent, RichContentBlock, TextFormat};
    use rushdino_gateway::{GatewayAdapterCapabilities, GatewayRichDeliveryMode};

    use super::{plan_delivery, SlackDeliveryPlan};

    fn capabilities() -> GatewayAdapterCapabilities {
        GatewayAdapterCapabilities {
            plain_text: true,
            markdown: true,
            code_blocks: true,
            images: GatewayRichDeliveryMode::Native,
            link_buttons: GatewayRichDeliveryMode::Native,
        }
    }

    #[test]
    fn builds_native_blocks_with_text_fallback() {
        let message = RichContent {
            fallback_text: "Fallback".to_owned(),
            blocks: vec![
                RichContentBlock::FormattedText {
                    text: "*Status*".to_owned(),
                    format: TextFormat::Markdown,
                },
                RichContentBlock::Image {
                    url: "https://example.com/dashboard.png".to_owned(),
                    alt: Some("Dashboard".to_owned()),
                },
                RichContentBlock::LinkButtons {
                    items: vec![LinkTarget {
                        label: "Open".to_owned(),
                        url: "https://example.com/open".to_owned(),
                    }],
                },
            ],
        };

        match plan_delivery(&message, &capabilities()) {
            SlackDeliveryPlan::Native { text, blocks } => {
                assert_eq!(text, "Fallback");
                assert_eq!(blocks.len(), 3);
            }
            other => panic!("expected native blocks, got {other:?}"),
        }
    }

    #[test]
    fn degrades_multiple_images() {
        let message = RichContent {
            fallback_text: "Fallback".to_owned(),
            blocks: vec![
                RichContentBlock::Image {
                    url: "https://example.com/one.png".to_owned(),
                    alt: None,
                },
                RichContentBlock::Image {
                    url: "https://example.com/two.png".to_owned(),
                    alt: None,
                },
            ],
        };

        match plan_delivery(&message, &capabilities()) {
            SlackDeliveryPlan::Degraded { reason, .. } => {
                assert!(reason.contains("only one image block"));
            }
            other => panic!("expected degraded plan, got {other:?}"),
        }
    }
}
