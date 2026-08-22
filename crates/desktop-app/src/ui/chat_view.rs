//! Chat area: turn-structured transcript, pending gates, and composer.
//!
//! Turns read like a signed runtime log rather than chat bubbles: a mono
//! metadata line names the speaker, assistant turns carry a brand-green
//! rule, and tool activity is set inline in mono.
//!
//! While a run is live, that rule pulses, the meta line ticks elapsed time
//! (`rushdino · 0:07`), and the transcript follows new content like
//! `tail -f`. Scrolling up releases follow and raises a "jump to latest"
//! chip.

use std::time::Instant;

use gpui::{
    div, point, px, Animation, AnimationExt as _, AnyElement, Context, Entity,
    InteractiveElement as _, FontWeight, IntoElement, ParentElement as _, ScrollHandle,
    SharedString, StatefulInteractiveElement as _, Styled as _, Window,
};
use gpui::prelude::FluentBuilder as _;
use gpui_component::{
    button::Button,
    highlighter::HighlightTheme,
    text::{TextView, TextViewStyle},
    ActiveTheme as _, h_flex, v_flex, IconName, Sizable as _,
};

use crate::{
    models::{ChatMessage, ChatRole, Destination},
    store::{AppStore, Selection},
    ui::{approval_card, composer_view::Composer, input_request_view, tokens, AppView},
};

/// How close to the bottom (px) counts as "following" the transcript.
const FOLLOW_SLACK: f32 = 24.0;

/// Render the detail area for the current selection.
pub fn render(
    store_entity: Entity<AppStore>,
    composer: Entity<Composer>,
    scroll: &ScrollHandle,
    window: &mut Window,
    cx: &mut Context<AppView>,
) -> gpui::AnyElement {
    let store = store_entity.read(cx);

    // Non-chat destinations render their loaded resource list.
    if let Some(Selection::Workspace(destination)) = &store.selection {
        if *destination != Destination::Chat && destination.api_path().is_some() {
            return resource_list(store_entity, cx, *destination).into_any_element();
        }
    }

    chat_area(store_entity, composer, scroll, window, cx).into_any_element()
}

fn chat_area(
    store_entity: Entity<AppStore>,
    composer: Entity<Composer>,
    scroll: &ScrollHandle,
    window: &mut Window,
    cx: &mut Context<AppView>,
) -> impl IntoElement {
    // Snapshot the state this frame renders; rendering borrows cx mutably.
    let store = store_entity.read(cx);
    let messages = store.messages.clone();
    let streaming_id = store.streaming_message_id.clone();
    let started_at = store.streaming_started_at;
    let approvals = store.pending_approvals.clone();
    let input_requests = store.pending_input_requests.clone();
    let transcript_is_empty =
        messages.is_empty() && approvals.is_empty() && input_requests.is_empty();

    let mut list = v_flex().max_w(px(768.)).mx_auto().gap_5().py_6();

    if transcript_is_empty {
        list = list.child(empty_state(composer.clone(), cx));
    } else {
        for message in &messages {
            let streaming = streaming_id.as_deref() == Some(message.id.as_str());
            list = list.child(message_row(message, streaming, started_at, window, cx));
        }
        for approval in approvals {
            list = list.child(approval_card::render(store_entity.clone(), approval, cx));
        }
        for request in input_requests {
            list = list.child(input_request_view::render(store_entity.clone(), request, cx));
        }
    }

    // tail -f semantics: pin to the bottom while the operator reads there;
    // a wheel-up releases the pin until they return.
    let dist_from_bottom = scroll.max_offset().height + scroll.offset().y;
    let pinned = dist_from_bottom <= px(FOLLOW_SLACK);
    if pinned {
        scroll.scroll_to_bottom();
    }

    let mut footer = div().relative().px_6().pb_4().child(composer);
    if !pinned {
        footer = footer.child(jump_chip(scroll.clone(), cx));
    }

    v_flex()
        .flex_1()
        .min_h_0()
        .bg(cx.theme().background)
        .text_color(cx.theme().foreground)
        .overflow_hidden()
        .child(
            div()
                .id("chat-scroll")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .track_scroll(scroll)
                .px_6()
                .child(list),
        )
        .child(footer)
}

/// Floating chip that re-pins the transcript to the newest content.
fn jump_chip(scroll: ScrollHandle, cx: &Context<AppView>) -> impl IntoElement {
    let view = cx.entity().downgrade();
    Button::new("jump-latest")
        .outline()
        .small()
        .icon(IconName::ArrowDown)
        .label("Latest")
        .on_click(move |_, _, cx: &mut gpui::App| {
            // Offset directly so the very next frame sees "at bottom".
            scroll.set_offset(point(px(0.), -scroll.max_offset().height));
            let _ = view.update(cx, |_, _| {});
        })
}

/// Empty transcript: what this surface is, and three ways to start.
fn empty_state(composer: Entity<Composer>, cx: &mut Context<AppView>) -> AnyElement {
    let starters = [
        ("Ask what RushDino can do", IconName::Bot),
        ("Show the kanban board", IconName::LayoutDashboard),
        ("Schedule a daily standup summary at 9am", IconName::Calendar),
    ];

    let mut chips = h_flex().flex_wrap().justify_center().gap_2();
    for (prompt, icon) in starters {
        let composer = composer.clone();
        chips = chips.child(
            Button::new(SharedString::from(format!("starter-{prompt}")))
                .outline()
                .small()
                .icon(icon)
                .label(prompt)
                .on_click(move |_, window, cx: &mut gpui::App| {
                    composer.update(cx, |c, cx| c.set_draft(prompt, window, cx));
                }),
        );
    }

    v_flex()
        .min_h(px(390.))
        .items_center()
        .justify_center()
        .gap_3()
        .child(
            div()
                .text_size(px(tokens::TITLE))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(cx.theme().foreground)
                .child("Say hello."),
        )
        .child(
            div()
                .max_w(px(420.))
                .text_center()
                .text_size(px(tokens::SECONDARY))
                .text_color(cx.theme().muted_foreground)
                .child("RushDino runs entirely on this machine. Nothing you type leaves it."),
        )
        .child(chips)
        .into_any_element()
}

/// Mono speaker line: who said it, and when the runtime recorded it.
fn turn_meta(label: String, cx: &Context<AppView>) -> AnyElement {
    tokens::meta(label, cx).into_any_element()
}

fn message_row(
    message: &ChatMessage,
    streaming: bool,
    started_at: Option<Instant>,
    window: &mut Window,
    cx: &mut Context<AppView>,
) -> AnyElement {
    match message.role {
        ChatRole::Tool => tool_event_row(message, cx),
        ChatRole::User => user_turn(message, cx),
        _ => assistant_turn(message, streaming, started_at, window, cx),
    }
}

/// "you · 14:02" — wall-clock minute of the recorded turn.
fn user_label(message: &ChatMessage) -> String {
    match &message.created_at {
        Some(time) => format!("you · {}", short_time(time)),
        None => "you".to_string(),
    }
}

fn user_turn(message: &ChatMessage, cx: &mut Context<AppView>) -> AnyElement {
    v_flex()
        .w_full()
        .gap_1()
        .child(h_flex().w_full().justify_end().child(turn_meta(user_label(message), cx)))
        .child(
            h_flex().w_full().justify_end().child(
                div()
                    .max_w(px(672.))
                    .px_3()
                    .py_2()
                    .rounded_md()
                    .border_1()
                    .border_color(cx.theme().border)
                    .bg(cx.theme().muted)
                    .child(message.content.clone()),
            ),
        )
        .into_any_element()
}

/// Assistant label carries the live run clock while streaming.
fn assistant_label(streaming: bool, started_at: Option<Instant>, message: &ChatMessage) -> String {
    if !streaming {
        return match &message.created_at {
            Some(time) => format!("rushdino · {}", short_time(time)),
            None => "rushdino".to_string(),
        };
    }
    let secs = started_at.map(|t| t.elapsed().as_secs()).unwrap_or(0);
    format!("rushdino · {}:{:02}", secs / 60, secs % 60)
}

fn assistant_turn(
    message: &ChatMessage,
    streaming: bool,
    started_at: Option<Instant>,
    window: &mut Window,
    cx: &mut Context<AppView>,
) -> AnyElement {
    let rule = div().w(px(2.)).rounded_full().bg(cx.theme().primary);

    // The one moving part on the page: while the run is live, its rule
    // breathes. Done runs hold still.
    let rule: AnyElement = if streaming {
        rule.with_animation(
            SharedString::from(format!("pulse-{}", message.id)),
            Animation::new(std::time::Duration::from_millis(1600))
                .repeat()
                .with_easing(gpui::pulsating_between(0.35, 1.0)),
            |rule, delta| rule.opacity(delta),
        )
        .into_any_element()
    } else {
        rule.into_any_element()
    };

    let body = div()
        .flex_1()
        .min_w_0()
        .max_w(px(672.))
        .when(!message.content.trim().is_empty(), |body| {
            body.child(markdown_body(message, window, cx))
        });

    v_flex()
        .w_full()
        .gap_1()
        .child(turn_meta(assistant_label(streaming, started_at, message), cx))
        .child(h_flex().w_full().gap_3().child(rule).child(body))
        .into_any_element()
}

/// Assistant prose renders as markdown with a dark code theme.
fn markdown_body(message: &ChatMessage, window: &mut Window, cx: &mut Context<AppView>) -> AnyElement {
    TextView::markdown(
        SharedString::from(format!("md-{}", message.id)),
        message.content.clone(),
        window,
        cx,
    )
    .selectable(true)
    .style(TextViewStyle {
        is_dark: true,
        highlight_theme: HighlightTheme::default_dark(),
        ..Default::default()
    })
    .into_any_element()
}

/// Inline mono line for tool activity; the glyph encodes completion.
/// Indented to sit under the assistant body column.
fn tool_event_row(message: &ChatMessage, cx: &mut Context<AppView>) -> AnyElement {
    let running = message.content.ends_with("running");
    h_flex()
        .pl(px(14.))
        .gap_2()
        .child(
            div()
                .font_family(cx.theme().mono_font_family.clone())
                .text_size(px(tokens::MICRO))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(if running {
                    cx.theme().warning
                } else {
                    cx.theme().success
                })
                .child(if running { "…" } else { "✓" }),
        )
        .child(tokens::meta(message.content.clone(), cx))
        .into_any_element()
}

/// RFC3339-ish timestamps collapse to HH:MM; anything else passes through.
fn short_time(timestamp: &str) -> String {
    let bytes = timestamp.as_bytes();
    if timestamp.len() >= 16
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && (bytes[10] == b'T' || bytes[10] == b' ')
    {
        timestamp[11..16].to_string()
    } else {
        timestamp.to_string()
    }
}

fn resource_list(
    store_entity: Entity<AppStore>,
    cx: &mut Context<AppView>,
    destination: Destination,
) -> impl IntoElement {
    let store = store_entity.read(cx);
    let mut list = v_flex().gap_2().py_4();

    let value = store
        .resources
        .iter()
        .find(|(d, _)| *d == destination)
        .map(|(_, v)| v.clone());

    let mut count = None;
    match &value {
        None => {
            list = list.child(tokens::meta("loading", cx));
        }
        Some(value) if destination == Destination::Kanban => {
            for group in kanban_groups(value, cx) {
                list = list.child(group);
            }
        }
        Some(value) => {
            let items = crate::models::collection_items(value);
            count = Some(items.len());
            if items.is_empty() {
                list = list.child(tokens::meta("Nothing here yet.", cx));
            }
            for (key, item) in items.iter().enumerate() {
                list = list.child(resource_row(item, cx, key));
            }
        }
    }

    let mut header = h_flex()
        .items_baseline()
        .gap_2()
        .child(
            div()
                .text_size(px(tokens::TITLE))
                .font_weight(FontWeight::SEMIBOLD)
                .child(destination.title()),
        );
    if let Some(count) = count {
        header = header.child(tokens::meta(format!("· {count}"), cx));
    }

    v_flex()
        .flex_1()
        .min_h_0()
        .overflow_hidden()
        .px_8()
        .py_4()
        .child(header)
        .child(
            div()
                .id("resource-scroll")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .child(list),
        )
}

fn resource_row(item: &serde_json::Value, cx: &Context<AppView>, key: usize) -> AnyElement {
    let subtitle = crate::models::display_subtitle(item);

    let row = v_flex()
        .id(SharedString::from(format!("resource-{key}")))
        .px_3()
        .py_2()
        .rounded_md()
        .border_1()
        .border_color(cx.theme().border)
        .hover(|style| style.bg(cx.theme().muted))
        .child(crate::models::display_title(item));

    match subtitle {
        Some(subtitle) if !subtitle.is_empty() => {
            row.child(tokens::meta(subtitle, cx)).into_any_element()
        }
        _ => row.into_any_element(),
    }
}

/// Kanban boards render as titled column sections instead of a flat list.
fn kanban_groups(value: &serde_json::Value, cx: &Context<AppView>) -> Vec<AnyElement> {
    const COLUMNS: [(&str, &str); 7] = [
        ("backlog", "Backlog"),
        ("todo", "To do"),
        ("in_progress", "In progress"),
        ("review", "Review"),
        ("testing", "Testing"),
        ("done", "Done"),
        ("blocked", "Blocked"),
    ];

    let mut groups: Vec<AnyElement> = Vec::new();
    for (key, title) in COLUMNS {
        let Some(items) = value.get(key).and_then(|v| v.as_array()) else {
            continue;
        };
        if items.is_empty() {
            continue;
        }
        let mut section = v_flex().gap_2().pb_3();
        section = section.child(
            h_flex()
                .items_baseline()
                .gap_2()
                .child(
                    div()
                        .text_size(px(tokens::SECONDARY))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(title.to_string()),
                )
                .child(tokens::meta(format!("· {}", items.len()), cx)),
        );
        for item in items {
            section = section.child(resource_row(item, cx, key.len()));
        }
        groups.push(section.into_any_element());
    }
    groups
}
