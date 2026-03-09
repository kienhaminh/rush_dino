use rushdino_common::{LinkTarget, RichContent, RichContentBlock};
use rushdino_gateway::{
    rich_message::{render_markdown_fallback_message, render_plain_text_block},
    GatewayAdapterCapabilities,
};

const DISCORD_MESSAGE_LIMIT: usize = 2000;
const DISCORD_EMBED_DESCRIPTION_LIMIT: usize = 4096;
const DISCORD_MAX_BUTTONS: usize = 5;

#[derive(Debug, Clone)]
pub enum DiscordDeliveryPlan {
    TextOnly {
        text: String,
    },
    NativeMessage {
        content: Option<String>,
        embed_description: Option<String>,
        image_url: Option<String>,
        buttons: Vec<LinkTarget>,
    },
    Degraded {
        text: String,
        reason: String,
    },
}

pub fn plan_delivery(
    message: &RichContent,
    capabilities: &GatewayAdapterCapabilities,
) -> DiscordDeliveryPlan {
    let degraded_text = render_markdown_fallback_message(message, capabilities);
    let mut image_url: Option<String> = None;
    let mut button_items: Option<Vec<LinkTarget>> = None;

    for block in &message.blocks {
        match block {
            RichContentBlock::Image { url, .. } => {
                if image_url.is_some() {
                    return DiscordDeliveryPlan::Degraded {
                        text: degraded_text,
                        reason:
                            "discord native delivery degraded: only one image block is supported"
                                .to_owned(),
                    };
                }
                image_url = Some(url.clone());
            }
            RichContentBlock::LinkButtons { items } => {
                if button_items.is_some() {
                    return DiscordDeliveryPlan::Degraded {
                        text: degraded_text,
                        reason: "discord native delivery degraded: only one link_buttons block is supported".to_owned(),
                    };
                }
                if items.len() > DISCORD_MAX_BUTTONS {
                    return DiscordDeliveryPlan::Degraded {
                        text: degraded_text,
                        reason: format!(
                            "discord native delivery degraded: only {DISCORD_MAX_BUTTONS} buttons fit in one action row"
                        ),
                    };
                }
                button_items = Some(items.clone());
            }
            _ => {}
        }
    }

    let buttons = button_items.unwrap_or_default();
    if image_url.is_none() && buttons.is_empty() {
        return DiscordDeliveryPlan::TextOnly {
            text: degraded_text,
        };
    }

    let text_without_native = message_without_blocks(message, |block| {
        !matches!(
            block,
            RichContentBlock::Image { .. } | RichContentBlock::LinkButtons { .. }
        )
    });
    let rendered_text = render_markdown_fallback_message(&text_without_native, capabilities);
    let trimmed = rendered_text.trim();

    if image_url.is_some() {
        if trimmed.len() > DISCORD_EMBED_DESCRIPTION_LIMIT {
            return DiscordDeliveryPlan::Degraded {
                text: degraded_text,
                reason: format!(
                    "discord native delivery degraded: embed description exceeded {DISCORD_EMBED_DESCRIPTION_LIMIT} characters"
                ),
            };
        }
        return DiscordDeliveryPlan::NativeMessage {
            content: None,
            embed_description: if trimmed.is_empty() {
                None
            } else {
                Some(rendered_text)
            },
            image_url,
            buttons,
        };
    }

    let content = if trimmed.is_empty() {
        Some(degraded_text.clone())
    } else {
        Some(rendered_text)
    };
    if content.as_deref().unwrap_or_default().len() > DISCORD_MESSAGE_LIMIT {
        return DiscordDeliveryPlan::Degraded {
            text: degraded_text,
            reason: format!(
                "discord native delivery degraded: message body exceeded {DISCORD_MESSAGE_LIMIT} characters"
            ),
        };
    }

    DiscordDeliveryPlan::NativeMessage {
        content,
        embed_description: None,
        image_url: None,
        buttons,
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

    use super::{plan_delivery, DiscordDeliveryPlan};

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
    fn builds_embed_with_image_and_buttons() {
        let message = RichContent {
            fallback_text: "fallback".to_owned(),
            blocks: vec![
                RichContentBlock::FormattedText {
                    text: "Dashboard update".to_owned(),
                    format: TextFormat::Markdown,
                },
                RichContentBlock::Image {
                    url: "https://example.com/dashboard.png".to_owned(),
                    alt: None,
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
            DiscordDeliveryPlan::NativeMessage {
                image_url,
                embed_description,
                buttons,
                ..
            } => {
                assert_eq!(
                    image_url.as_deref(),
                    Some("https://example.com/dashboard.png")
                );
                assert!(embed_description
                    .unwrap_or_default()
                    .contains("Dashboard update"));
                assert_eq!(buttons.len(), 1);
            }
            other => panic!("expected native message, got {other:?}"),
        }
    }

    #[test]
    fn builds_buttons_only_native_message() {
        let message = RichContent {
            fallback_text: "fallback".to_owned(),
            blocks: vec![RichContentBlock::LinkButtons {
                items: vec![LinkTarget {
                    label: "Open".to_owned(),
                    url: "https://example.com/open".to_owned(),
                }],
            }],
        };

        match plan_delivery(&message, &capabilities()) {
            DiscordDeliveryPlan::NativeMessage {
                content,
                image_url,
                buttons,
                ..
            } => {
                assert!(content.is_some());
                assert!(image_url.is_none());
                assert_eq!(buttons.len(), 1);
            }
            other => panic!("expected native message, got {other:?}"),
        }
    }

    #[test]
    fn degrades_multiple_images() {
        let message = RichContent {
            fallback_text: "fallback".to_owned(),
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
            DiscordDeliveryPlan::Degraded { reason, .. } => {
                assert!(reason.contains("only one image block"));
            }
            other => panic!("expected degraded message, got {other:?}"),
        }
    }
}
