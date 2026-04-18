use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

/// Installs the macOS menu-bar icon with a short menu (New Chat, Open,
/// Hide, Quit). Left-clicking the icon toggles the main window.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let new_chat = MenuItemBuilder::with_id("tray.new-chat", "New Chat")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let show = MenuItemBuilder::with_id("tray.show", "Open RushDino").build(app)?;
    let hide = MenuItemBuilder::with_id("tray.hide", "Hide Window").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&new_chat)
        .separator()
        .item(&show)
        .item(&hide)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let mut builder = TrayIconBuilder::with_id("rushdino-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray.new-chat" => {
                focus_main(app);
                let _ = app.emit("menu:new-chat", ());
            }
            "tray.show" => focus_main(app),
            "tray.hide" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.hide();
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let visible = win.is_visible().unwrap_or(false);
                    let focused = win.is_focused().unwrap_or(false);
                    if visible && focused {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

fn focus_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}
