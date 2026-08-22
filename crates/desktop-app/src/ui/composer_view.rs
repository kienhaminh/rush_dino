//! Composer: the console field where the operator talks to the agent.
use gpui::{
    div, px, App, AppContext as _, Context, Entity, Focusable as _, IntoElement,
    ParentElement as _, Render, SharedString, Styled as _, Window,
};
use gpui::prelude::FluentBuilder as _;
use gpui_component::{
    ActiveTheme as _, Disableable as _, IconName, Sizable as _,
    button::{Button, ButtonVariants as _},
    h_flex,
    input::{Input, InputEvent, InputState},
    v_flex,
};

use crate::store::AppStore;

pub struct Composer {
    store: Entity<AppStore>,
    input: Entity<InputState>,
    /// Subscriptions must stay alive for input events to keep firing.
    _subscriptions: Vec<gpui::Subscription>,
}

impl Composer {
    pub fn new(store: Entity<AppStore>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let input = cx.new(|cx| {
            InputState::new(window, cx)
                .placeholder("Message RushDino")
                .auto_grow(1, 6)
        });
        window.focus(&input.read(cx).focus_handle(cx));

        let subscriptions = vec![cx.subscribe_in(
            &input,
            window,
            |this, _, event: &InputEvent, window, cx| {
                // Multi-line input: plain Enter breaks the line, ⌘↩ sends.
                if matches!(event, InputEvent::PressEnter { secondary: true }) {
                    this.submit(window, cx);
                }
            },
        )];

        Self { store, input, _subscriptions: subscriptions }
    }

    /// Put text in the field and hand focus to it. Used by starter prompts.
    pub fn set_draft(&self, text: impl Into<SharedString>, window: &mut Window, cx: &mut App) {
        let text: SharedString = text.into();
        self.input.update(cx, |state, cx| state.set_value(text, window, cx));
        window.focus(&self.input.read(cx).focus_handle(cx));
    }

    fn submit(&self, window: &mut Window, cx: &mut Context<Self>) {
        let text = self.input.read(cx).value().trim().to_string();
        if text.is_empty() || self.store.read(cx).is_sending {
            return;
        }
        self.input.update(cx, |state, cx| state.set_value("", window, cx));
        self.store.update(cx, |store, _| store.send_message(text));
        window.focus(&self.input.read(cx).focus_handle(cx));
    }

    fn click_handler(
        &self,
    ) -> impl Fn(&gpui::ClickEvent, &mut Window, &mut App) + 'static {
        let store = self.store.clone();
        let input = self.input.clone();
        move |_, window, cx: &mut App| {
            let text = input.read(cx).value().trim().to_string();
            if text.is_empty() || store.read(cx).is_sending {
                return;
            }
            input.update(cx, |state, cx| state.set_value("", window, cx));
            store.update(cx, |store, _| store.send_message(text));
            window.focus(&input.read(cx).focus_handle(cx));
        }
    }
}

impl Render for Composer {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let is_sending = self.store.read(cx).is_sending;
        let can_send =
            !self.input.read(cx).value().trim().is_empty() && !is_sending;

        v_flex()
            .max_w(px(768.))
            .mx_auto()
            .w_full()
            .gap_1()
            .child(
                h_flex()
                    .items_end()
                    .gap_2()
                    .px_3()
                    .py_2()
                    .rounded_lg()
                    .border_1()
                    .border_color(cx.theme().border)
                    .bg(cx.theme().muted)
                    .child(
                        Input::new(&self.input)
                            .appearance(false)
                            .bordered(false)
                            .focus_bordered(false)
                            .flex_1(),
                    )
                    .child(
                        Button::new("send")
                            .primary()
                            .small()
                            .icon(IconName::ArrowUp)
                            .disabled(!can_send)
                            .on_click(self.click_handler()),
                    ),
            )
            .when(can_send, |this| {
                this.child(
                    h_flex()
                        .justify_end()
                        .px_1()
                        .child(
                            div()
                                .font_family(cx.theme().mono_font_family.clone())
                                .text_size(px(11.))
                                .text_color(cx.theme().muted_foreground)
                                .child("⌘↩ send"),
                        ),
                )
            })
    }
}
