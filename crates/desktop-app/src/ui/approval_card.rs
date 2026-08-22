//! Pending tool approval: the approval gate.
//!
//! This is the loudest surface in the app by design — the one place where
//! the agent asks the operator to trust it. A warning-colored rule, a
//! tracked mono eyebrow, a mono tool name, and two decisive buttons.

use gpui::{App, Entity, FontWeight, IntoElement, ParentElement as _, Styled as _, div, px};
use gpui_component::{
    ActiveTheme as _,
    button::{Button, ButtonVariants as _},
    h_flex, v_flex,
};

use crate::{
    models::PendingApproval,
    store::AppStore,
    ui::tokens,
};

/// Render an approval gate for the given pending request.
pub fn render(
    store_entity: Entity<AppStore>,
    approval: PendingApproval,
    cx: &App,
) -> impl IntoElement {
    let request_id = approval.request_id.clone();
    let pretty_args = serde_json::to_string_pretty(&approval.arguments)
        .unwrap_or_else(|_| "{}".to_string());

    let deny_store = store_entity.clone();
    let deny_id = request_id.clone();
    let approve_store = store_entity;
    let approve_id = request_id;

    h_flex()
        .w_full()
        .max_w(px(672.))
        .rounded_md()
        .border_1()
        .border_color(cx.theme().border)
        .bg(tokens::gate_surface())
        .overflow_hidden()
        .child(div().w(px(3.)).bg(cx.theme().warning))
        .child(
            v_flex()
                .flex_1()
                .min_w_0()
                .gap_2()
                .p_4()
                .child(tokens::eyebrow("TOOL REQUEST", cx.theme().warning))
                .child(
                    div()
                        .font_family(cx.theme().mono_font_family.clone())
                        .text_size(px(14.0))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(cx.theme().foreground)
                        .child(approval.tool.clone()),
                )
                .child(
                    div()
                        .max_h(px(160.))
                        .overflow_hidden()
                        .font_family(cx.theme().mono_font_family.clone())
                        .text_size(px(tokens::MICRO))
                        .text_color(cx.theme().muted_foreground)
                        .child(pretty_args),
                )
                .child(
                    h_flex()
                        .justify_end()
                        .gap_2()
                        .pt_1()
                        .child(
                            Button::new("deny")
                                .danger()
                                .label("Deny")
                                .on_click(move |_, _, cx: &mut App| {
                                    deny_store.update(cx, |store, _| {
                                        store.decide_approval(&deny_id, false)
                                    });
                                }),
                        )
                        .child(
                            Button::new("approve")
                                .primary()
                                .label("Approve")
                                .on_click(move |_, _, cx: &mut App| {
                                    approve_store.update(cx, |store, _| {
                                        store.decide_approval(&approve_id, true)
                                    });
                                }),
                        ),
                ),
        )
}
