mod commands;
mod keychain;
mod menu;
mod server_runtime;
mod tray;
mod window;

use std::sync::Arc;

use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use server_runtime::{ServerHandle, ServerInfo};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,tauri=warn")),
        )
        .with_target(false)
        .compact()
        .init();

    // ⌘⇧Space summons the command palette from anywhere on the system.
    let palette_shortcut =
        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler({
                    let wanted = palette_shortcut;
                    move |app, shortcut, event| {
                        if shortcut == &wanted && event.state() == ShortcutState::Pressed {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                            let _ = app.emit("palette:toggle", ());
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(move |app| {
            let window = app
                .get_webview_window("main")
                .expect("main window must exist");
            window::apply_macos_vibrancy(&window);
            window::position_traffic_lights(&window);

            if let Err(e) = app.global_shortcut().register(palette_shortcut) {
                tracing::warn!("failed to register ⌘⇧Space global shortcut: {e}");
            }

            match menu::build_menu(app.handle()) {
                Ok(m) => {
                    if let Err(e) = app.set_menu(m) {
                        tracing::warn!("failed to attach native menu: {e}");
                    }
                    app.on_menu_event(|app_handle, event| {
                        menu::on_menu_event(app_handle, event.id().as_ref());
                    });
                }
                Err(e) => tracing::warn!("failed to build native menu: {e}"),
            }

            if let Err(e) = tray::install(app.handle()) {
                tracing::warn!("failed to install menubar tray: {e}");
            }

            let handle = app.handle().clone();
            let server = tauri::async_runtime::block_on(async move {
                server_runtime::start(handle).await
            })?;
            app.manage(ServerInfo { port: server.port });
            app.manage(Arc::new(server));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_server_port,
            commands::open_in_finder,
            commands::notify,
            commands::check_for_updates,
            commands::install_update,
            commands::keychain_set,
            commands::keychain_get,
            commands::keychain_delete,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            if let Some(server) = app_handle.try_state::<Arc<ServerHandle>>() {
                server.shutdown();
            }
        }
    });
}
