//! Root application view: title bar + sidebar + chat/detail area,
//! plus the daemon→UI event pump.

use std::time::Duration;

use futures::StreamExt as _;
use gpui::{
    px, size, App, AppContext as _, Context, Entity, IntoElement as _, ParentElement as _,
    Render, ScrollHandle, Styled as _, Window, WindowBounds, WindowOptions, div,
};
use gpui_component::{h_flex, v_flex, ActiveTheme as _, TitleBar};

pub mod approval_card;
pub mod chat_view;
pub mod composer_view;
pub mod input_request_view;
pub mod search_view;
pub mod settings_view;
pub mod tokens;
pub mod sidebar_view;

use crate::{
    models::Destination,
    store::{AppStore, Selection},
    ui::{composer_view::Composer, search_view::SearchView},
};

/// Top-level view rendered inside the main window.
pub struct AppView {
    store: Entity<AppStore>,
    composer: Entity<Composer>,
    search: Entity<SearchView>,
    /// Transcript scroll state: owns the tail -f follow behavior.
    scroll: ScrollHandle,
}

impl AppView {
    pub fn new(
        event_rx: futures::channel::mpsc::UnboundedReceiver<crate::daemon::UiEvent>,
        store: Entity<AppStore>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let composer = cx.new(|cx| Composer::new(store.clone(), window, cx));
        let search = cx.new(|cx| SearchView::new(store.clone(), window, cx));

        // Pump daemon events into the store on the UI executor.
        cx.spawn(async move |this: gpui::WeakEntity<AppView>, cx: &mut gpui::AsyncApp| {
            let mut events = event_rx;
            while let Some(event) = events.next().await {
                let _ = this.update(cx, |view, cx| {
                    view.store.update(cx, |store, _| store.handle_event(event.clone()));
                    cx.notify();
                });
            }
        })
        .detach();

        // Tick the live run clock: while a run streams, redraw every 500ms
        // so the elapsed readout advances.
        cx.spawn(async move |view: gpui::WeakEntity<AppView>, cx: &mut gpui::AsyncApp| {
            loop {
                cx.background_executor().timer(Duration::from_millis(500)).await;
                let _ = view.update(cx, |view, cx| {
                    if view.store.read(cx).is_sending {
                        cx.notify();
                    }
                });
            }
        })
        .detach();

        Self { store, composer, search, scroll: ScrollHandle::new() }
    }

    /// Standard window options for the main window.
    pub fn window_options(cx: &mut App) -> WindowOptions {
        WindowOptions {
            window_bounds: Some(WindowBounds::centered(size(px(1180.), px(780.)), cx)),
            titlebar: Some(TitleBar::title_bar_options()),
            window_min_size: Some(size(px(900.), px(620.))),
            ..Default::default()
        }
    }
}

impl Render for AppView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl gpui::IntoElement {
        let store = self.store.read(cx);
        let title = store.detail_title();

        let error_banner = match &store.error {
            Some(message) => h_flex()
                .w_full()
                .items_center()
                .gap_3()
                .py_2()
                .pl_0()
                .pr_4()
                .bg(gpui::rgb(0x2E1B17))
                .child(div().w(px(3.)).py_2().bg(cx.theme().danger))
                .child(tokens::eyebrow("error", cx.theme().danger))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .text_size(px(tokens::SECONDARY))
                        .text_color(cx.theme().foreground)
                        .child(message.clone()),
                ),
            None => v_flex(),
        };

        let detail = match self.store.read(cx).selection.clone() {
            Some(Selection::Settings) => {
                settings_view::render(self.store.clone(), cx).into_any_element()
            }
            Some(Selection::Workspace(Destination::Search)) => {
                self.search.clone().into_any_element()
            }
            _ => chat_view::render(self.store.clone(), self.composer.clone(), &self.scroll, window, cx),
        };

        v_flex()
            .size_full()
            .bg(cx.theme().background)
            .text_color(cx.theme().foreground)
            .child(TitleBar::new().child(title))
            .child(error_banner)
            .child(
                h_flex()
                    .flex_1()
                    .min_h_0()
                    .overflow_hidden()
                    .child(sidebar_view::render(self.store.clone(), cx))
                    .child(detail)
            )
    }
}
