use tauri::WebviewWindow;

/// Installs a single `NSVisualEffectView` beneath the window. Per-panel glass
/// is then painted in CSS via `backdrop-filter` over this substrate.
pub fn apply_macos_vibrancy(window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
        if let Err(e) = apply_vibrancy(
            window,
            NSVisualEffectMaterial::UnderWindowBackground,
            Some(NSVisualEffectState::Active),
            Some(14.0),
        ) {
            tracing::warn!("failed to apply macOS vibrancy: {e}");
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
    }
}

/// Placeholder: custom traffic-light Y-offset positioning lands in Phase C
/// alongside the overlay titlebar + ⌘K chip.
pub fn position_traffic_lights(_window: &WebviewWindow) {}
