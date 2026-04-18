use tauri::menu::{AboutMetadataBuilder, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Builds the native macOS menu bar.
///
/// Predefined items (Cut/Copy/Paste, Hide, Quit, Fullscreen, …) come from
/// Tauri; three custom items dispatch events the React shell listens for:
///
///   • `menu:new-chat`    — File ▸ New Chat              (⌘N)
///   • `palette:toggle`   — View ▸ Command Palette        (⌘K)
///   • `menu:settings`    — RushDino ▸ Settings…          (⌘,)
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about_metadata = AboutMetadataBuilder::new()
        .name(Some("RushDino"))
        .version(Some(env!("CARGO_PKG_VERSION").to_owned()))
        .build();

    let settings = MenuItemBuilder::with_id("menu.settings", "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let app_menu = SubmenuBuilder::new(app, "RushDino")
        .item(&PredefinedMenuItem::about(app, Some("About RushDino"), Some(about_metadata))?)
        .separator()
        .item(&settings)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let new_chat = MenuItemBuilder::with_id("menu.new-chat", "New Chat")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_chat)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let palette = MenuItemBuilder::with_id("menu.palette", "Command Palette")
        .accelerator("CmdOrCtrl+K")
        .build(app)?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&palette)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
        .build()
}

/// Wires menu-item clicks to webview events so the React shell can route
/// them (navigate to `/`, open the palette, open Settings).
pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
        "menu.new-chat" => {
            focus_main(app);
            let _ = app.emit("menu:new-chat", ());
        }
        "menu.palette" => {
            focus_main(app);
            let _ = app.emit("palette:toggle", ());
        }
        "menu.settings" => {
            focus_main(app);
            let _ = app.emit("menu:settings", ());
        }
        _ => {}
    }
}

fn focus_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}
