//! Structured input-request card: the quiet sibling of the approval gate.
//!
//! Fields are displayed as hints; structured submission will be wired in a
//! follow-up once per-field `InputState`s can be created off-render.

use gpui::{App, Entity, IntoElement, ParentElement as _, Styled as _, div, px};
use gpui_component::{ActiveTheme as _, v_flex};

use crate::{
    models::InputRequest,
    store::AppStore,
    ui::tokens,
};

/// Render a static summary card for the given pending request.
pub fn render(_store_entity: Entity<AppStore>, request: InputRequest, cx: &App) -> impl IntoElement {
    let mut card = v_flex()
        .w_full()
        .max_w(px(672.))
        .gap_2()
        .p_4()
        .rounded_md()
        .border_1()
        .border_color(cx.theme().border)
        .bg(cx.theme().muted)
        .child(tokens::eyebrow(
            "INPUT REQUESTED",
            cx.theme().muted_foreground,
        ))
        .child(
            div()
                .text_size(px(tokens::SECONDARY))
                .font_weight(gpui::FontWeight::SEMIBOLD)
                .text_color(cx.theme().foreground)
                .child(request.title().to_string()),
        );

    if let Some(description) = &request.payload.spec.description {
        card = card.child(
            div()
                .text_size(px(tokens::SECONDARY))
                .text_color(cx.theme().foreground)
                .child(description.clone()),
        );
    }

    for field in request.fields() {
        let required = if field.required == Some(true) { "*" } else { "" };
        card = card.child(tokens::meta(
            format!("{label}{required} — answer in chat", label = field.label),
            cx,
        ));
    }

    card
}
