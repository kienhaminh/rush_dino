use rushdino_common::{LinkTarget, RichContent, RichContentBlock};
use rushdino_gateway::{
    rich_message::{render_html_fallback_message, render_plain_text_block},
    GatewayAdapterCapabilities,
};

const TELEGRAM_MESSAGE_LIMIT: usize = 4096;
const TELEGRAM_CAPTION_LIMIT: usize = 1024;
const TELEGRAM_MAX_BUTTONS: usize = 3;

#[derive(Debug, Clone)]
pub enum TelegramDeliveryPlan {
    TextOnly {
        html: String,
    },
    NativeMessage {
        html: String,
        buttons: Vec<LinkTarget>,
    },
    NativePhoto {
        image_url: String,
        caption_html: String,
        buttons: Vec<LinkTarget>,
    },
    Degraded {
        html: String,
        reason: String,
    },
}

pub fn plan_delivery(
    message: &RichContent,
    capabilities: &GatewayAdapterCapabilities,
) -> TelegramDeliveryPlan {
    let degraded_html = render_html_fallback_message(message, capabilities);
    let mut image_url: Option<String> = None;
    let mut button_items: Option<Vec<LinkTarget>> = None;

    for block in &message.blocks {
        match block {
            RichContentBlock::Image { url, .. } => {
                if image_url.is_some() {
                    return TelegramDeliveryPlan::Degraded {
                        html: degraded_html,
                        reason:
                            "telegram native delivery degraded: only one image block is supported"
                                .to_owned(),
                    };
                }
                image_url = Some(url.clone());
            }
            RichContentBlock::LinkButtons { items } => {
                if button_items.is_some() {
                    return TelegramDeliveryPlan::Degraded {
                        html: degraded_html,
                        reason: "telegram native delivery degraded: only one link_buttons block is supported".to_owned(),
                    };
                }
                if items.len() > TELEGRAM_MAX_BUTTONS {
                    return TelegramDeliveryPlan::Degraded {
                        html: degraded_html,
                        reason: format!(
                            "telegram native delivery degraded: link_buttons supports at most {TELEGRAM_MAX_BUTTONS} items"
                        ),
                    };
                }
                button_items = Some(items.clone());
            }
            _ => {}
        }
    }

    let buttons = button_items.unwrap_or_default();
    if let Some(image_url) = image_url {
        let caption_html = render_html_fallback_message(
            &message_without_blocks(message, |block| {
                !matches!(
                    block,
                    RichContentBlock::Image { .. } | RichContentBlock::LinkButtons { .. }
                )
            }),
            capabilities,
        );
        if caption_html.len() > TELEGRAM_CAPTION_LIMIT {
            return TelegramDeliveryPlan::Degraded {
                html: degraded_html,
                reason: format!(
                    "telegram native delivery degraded: photo caption exceeded {TELEGRAM_CAPTION_LIMIT} characters"
                ),
            };
        }
        return TelegramDeliveryPlan::NativePhoto {
            image_url,
            caption_html,
            buttons,
        };
    }

    if !buttons.is_empty() {
        let message_without_buttons = message_without_blocks(message, |block| {
            !matches!(block, RichContentBlock::LinkButtons { .. })
        });
        let mut html = render_html_fallback_message(&message_without_buttons, capabilities);
        if html.trim().is_empty() {
            html = degraded_html.clone();
        }
        if html.len() > TELEGRAM_MESSAGE_LIMIT {
            return TelegramDeliveryPlan::Degraded {
                html: degraded_html,
                reason: format!(
                    "telegram native delivery degraded: message body exceeded {TELEGRAM_MESSAGE_LIMIT} characters"
                ),
            };
        }
        return TelegramDeliveryPlan::NativeMessage { html, buttons };
    }

    TelegramDeliveryPlan::TextOnly {
        html: degraded_html,
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
    use rushdino_common::{RichContent, RichContentBlock, TextFormat};
    use rushdino_gateway::{GatewayAdapterCapabilities, GatewayRichDeliveryMode};

    use super::{plan_delivery, TelegramDeliveryPlan, TELEGRAM_CAPTION_LIMIT};

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
    fn builds_native_photo_with_buttons() {
        let message = RichContent {
            fallback_text: "dashboard".to_owned(),
            blocks: vec![
                RichContentBlock::FormattedText {
                    text: "See the latest dashboard".to_owned(),
                    format: TextFormat::Markdown,
                },
                RichContentBlock::Image {
                    url: "https://example.com/dashboard.png".to_owned(),
                    alt: Some("Dashboard".to_owned()),
                },
                RichContentBlock::LinkButtons {
                    items: vec![rushdino_common::LinkTarget {
                        label: "Open".to_owned(),
                        url: "https://example.com/open".to_owned(),
                    }],
                },
            ],
        };

        let plan = plan_delivery(&message, &capabilities());
        match plan {
            TelegramDeliveryPlan::NativePhoto {
                image_url,
                caption_html,
                buttons,
            } => {
                assert_eq!(image_url, "https://example.com/dashboard.png");
                assert!(caption_html.contains("See the latest dashboard"));
                assert_eq!(buttons.len(), 1);
            }
            other => panic!("expected native photo plan, got {other:?}"),
        }
    }

    #[test]
    fn degrades_when_multiple_images_are_present() {
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

        let plan = plan_delivery(&message, &capabilities());
        match plan {
            TelegramDeliveryPlan::Degraded { reason, .. } => {
                assert!(reason.contains("only one image block"));
            }
            other => panic!("expected degraded plan, got {other:?}"),
        }
    }

    #[test]
    fn degrades_when_caption_overflows() {
        let message = RichContent {
            fallback_text: "fallback".to_owned(),
            blocks: vec![
                RichContentBlock::FormattedText {
                    text: "x".repeat(TELEGRAM_CAPTION_LIMIT + 10),
                    format: TextFormat::PlainText,
                },
                RichContentBlock::Image {
                    url: "https://example.com/one.png".to_owned(),
                    alt: None,
                },
            ],
        };

        let plan = plan_delivery(&message, &capabilities());
        match plan {
            TelegramDeliveryPlan::Degraded { reason, .. } => {
                assert!(reason.contains("caption exceeded"));
            }
            other => panic!("expected degraded plan, got {other:?}"),
        }
    }
}
