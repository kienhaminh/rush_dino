//! Search screen: filter conversations by title and jump to one.

use gpui::{
    App, AppContext as _, Context, Entity, FontWeight, InteractiveElement as _, IntoElement,
    ParentElement as _, Render, SharedString, StatefulInteractiveElement as _, Styled as _,
    Window, div, px,
};
use gpui_component::{
    ActiveTheme as _,
    button::{Button, ButtonVariants as _},
    h_flex, input::{Input, InputEvent, InputState}, v_flex,
};

use crate::{
    store::AppStore,
    ui::tokens,
};

pub struct SearchView {
    store: Entity<AppStore>,
    query: Entity<InputState>,
    /// Subscriptions must stay alive for input events to keep firing.
    _subscriptions: Vec<gpui::Subscription>,
}

impl SearchView {
    pub fn new(store: Entity<AppStore>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let query = cx.new(|cx| InputState::new(window, cx).placeholder("Search conversations"));

        let subscriptions = vec![cx.subscribe_in(
            &query,
            window,
            |_, _, _: &InputEvent, _, cx| cx.notify(),
        )];

        Self { store, query, _subscriptions: subscriptions }
    }
}

impl Render for SearchView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let needle = self.query.read(cx).value().trim().to_lowercase();
        let store = self.store.read(cx);

        let mut list = v_flex().gap_2();
        let matches: Vec<_> = store
            .conversations
            .iter()
            .filter(|c| needle.is_empty() || c.title.to_lowercase().contains(&needle))
            .cloned()
            .collect();

        if matches.is_empty() {
            let message = if needle.is_empty() {
                "No conversations yet.".to_string()
            } else {
                format!("Nothing matches \u{201C}{needle}\u{201D}.")
            };
            list = list.child(
                div()
                    .text_size(px(tokens::SECONDARY))
                    .text_color(cx.theme().muted_foreground)
                    .child(message),
            );
        }
        for conversation in &matches {
            let store = self.store.clone();
            let id = conversation.id.clone();
            let title = conversation.title.clone();
            list = list.child(
                Button::new(SharedString::from(id.clone()))
                    .ghost()
                    .label(title)
                    .on_click(move |_, _, cx: &mut App| {
                        store.update(cx, |store, _| store.select_conversation(&id));
                    }),
            );
        }

        v_flex()
            .flex_1()
            .min_h_0()
            .overflow_hidden()
            .px_8()
            .py_4()
            .child(
                h_flex()
                    .pb_3()
                    .child(
                        div()
                            .text_size(px(tokens::TITLE))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("Search"),
                    ),
            )
            .child(Input::new(&self.query).max_w(px(480.)))
            .child(
                div()
                    .id("search-scroll")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .pt_4()
                    .child(list),
            )
    }
}
