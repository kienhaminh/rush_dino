//! Settings screen: runtime status plus JSON panes for models, channels,
//! and privacy. Data is fetched from the server each time the screen opens.

use gpui::{
    Context, Entity, FontWeight, InteractiveElement as _, IntoElement, ParentElement as _,
    StatefulInteractiveElement as _, Styled as _, div, px,
};
use gpui_component::{ActiveTheme as _, h_flex, v_flex};

use crate::{
    store::AppStore,
    ui::{AppView, tokens},
};

/// Render the settings detail area for the current selection.
pub fn render(store_entity: Entity<AppStore>, cx: &Context<AppView>) -> gpui::AnyElement {
    let store = store_entity.read(cx);
    let settings = store.settings.clone().unwrap_or_default();

    let status = if store.booted && store.error.is_none() {
        "Connected"
    } else {
        "Starting"
    };

    let mut page = v_flex().max_w(px(720.)).gap_6();

    page = page.child(
        section("General", cx)
            .child(row("Status", status.to_string(), cx))
            .child(row(
                "Provider",
                store
                    .provider
                    .clone()
                    .unwrap_or_else(|| "Unavailable".to_string()),
                cx,
            )),
    );

    page = page.child(section("Models", cx).child(json_pane(
        pretty(settings.profiles.as_ref()),
        cx,
    )));
    page = page.child(section("Channels", cx).child(json_pane(
        pretty(settings.channels.as_ref()),
        cx,
    )));

    let security = settings
        .config
        .as_ref()
        .and_then(|config| config.get("security"))
        .cloned();
    page = page.child(section("Privacy", cx).child(json_pane(pretty(security.as_ref()), cx)));

    v_flex()
        .flex_1()
        .min_h_0()
        .overflow_hidden()
        .px_8()
        .py_4()
        .child(
            div()
                .text_size(px(tokens::TITLE))
                .font_weight(FontWeight::SEMIBOLD)
                .pb_3()
                .child("Settings"),
        )
        .child(
            div()
                .id("settings-scroll")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .child(page),
        )
    .into_any_element()
}

fn section(title: &str, cx: &Context<AppView>) -> gpui::Div {
    v_flex().gap_2().child(tokens::eyebrow(
        title.to_uppercase(),
        cx.theme().muted_foreground,
    ))
}

fn row(label: &str, value: String, cx: &Context<AppView>) -> gpui::Div {
    h_flex()
        .justify_between()
        .px_3()
        .py_2()
        .rounded_md()
        .border_1()
        .border_color(cx.theme().border)
        .child(div().text_sm().child(label.to_string()))
        .child(
            div()
                .text_sm()
                .text_color(cx.theme().muted_foreground)
                .child(value),
        )
}

fn json_pane(body: String, cx: &Context<AppView>) -> gpui::Div {
    div()
        .w_full()
        .p_3()
        .rounded_md()
        .border_1()
        .border_color(cx.theme().border)
        .bg(cx.theme().muted)
        .font_family(cx.theme().mono_font_family.clone())
        .text_size(px(tokens::MICRO))
        .text_color(cx.theme().muted_foreground)
        .child(body)
}

fn pretty(value: Option<&serde_json::Value>) -> String {
    match value {
        Some(value) => serde_json::to_string_pretty(value).unwrap_or_else(|_| "{}".to_string()),
        None => "Unavailable".to_string(),
    }
}
