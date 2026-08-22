//! RushDino desktop client entry point (GPUI + gpui-component).

mod api_client;
mod backend_process;
mod chat_socket;
mod daemon;
mod models;
mod signer;
mod store;
mod ui;

use gpui::{AnyView, Application, AppContext as _, Entity};
use gpui_component::Root;

use crate::{store::AppStore, ui::AppView};

fn main() {
    let app = Application::new().with_assets(gpui_component_assets::Assets);

    app.run(move |cx| {
        gpui_component::init(cx);
        // Push the RushDino palette into the component theme.
        ui::tokens::apply_theme(cx);

        // Start the backend supervisor + chat socket daemon.
        let handle = daemon::spawn();
        let store: Entity<AppStore> = cx.new(|_| AppStore::new(handle.command_tx.clone()));

        let window_options = AppView::window_options(cx);
        cx.open_window(window_options, move |window, cx| {
            let view: Entity<AppView> = cx.new(|cx| AppView::new(handle.event_rx, store.clone(), window, cx));
            cx.new(|cx| Root::new(AnyView::from(view), window, cx))
        })
        .expect("open main window");
    });
}
