use serde::Serialize;
use tauri::{AppHandle, State};

use crate::server_runtime::ServerInfo;

#[derive(Serialize)]
pub struct ServerInfoPayload {
    pub port: u16,
}

#[tauri::command]
pub fn get_server_port(state: State<'_, ServerInfo>) -> ServerInfoPayload {
    ServerInfoPayload { port: state.port }
}

#[tauri::command]
pub fn open_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn notify(title: String, body: String, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
pub struct UpdateInfoPayload {
    /// Version advertised by the updater endpoint.
    pub version: String,
    /// Version the user is currently running (from Cargo.toml).
    pub current_version: String,
    /// Release notes / changelog body, if the updater manifest provides one.
    pub body: Option<String>,
    /// Release date (ISO-8601) when available on the manifest.
    pub date: Option<String>,
}

/// Polls the updater endpoint. Returns `Ok(None)` when the running version is
/// already the latest, `Ok(Some(info))` when an upgrade is available, or
/// `Err` when the endpoint is unreachable / manifest malformed.
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<Option<UpdateInfoPayload>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => Ok(Some(UpdateInfoPayload {
            version: update.version.clone(),
            current_version: update.current_version.clone(),
            body: update.body.clone(),
            date: update.date.map(|d| d.to_string()),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Downloads + applies the currently-available update, then relaunches.
/// Rechecks the manifest inside the call (instead of taking the previous
/// `check_for_updates` payload) so a late-arriving release isn't skipped.
/// The process won't return normally on success — Tauri restarts the app.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no update available".to_owned())?;
    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

#[tauri::command]
pub fn keychain_set(service: String, account: String, password: String) -> Result<(), String> {
    crate::keychain::set(&service, &account, &password).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn keychain_get(service: String, account: String) -> Result<Option<String>, String> {
    crate::keychain::get(&service, &account).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn keychain_delete(service: String, account: String) -> Result<(), String> {
    crate::keychain::delete(&service, &account).map_err(|e| e.to_string())
}
