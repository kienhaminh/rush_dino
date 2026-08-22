//! Design tokens for the RushDino desktop shell.
//!
//! The palette lives in the gpui-component `Theme` (see [`apply_theme`]) so
//! every primitive (buttons, inputs, sidebar, title bar) inherits it. The
//! handful of roles the theme does not carry — the approval-gate surface and
//! shared type treatments — are defined here.

use gpui::{App, Div, Hsla, ParentElement as _, Styled as _, div, px};
use gpui_component::{ActiveTheme as _, Theme, ThemeMode};

/// Approval-gate surface: panel tone warmed toward the warning accent.
pub fn gate_surface() -> Hsla {
    gpui::rgb(0x241D12).into()
}

/// Type scale (px): detail titles, body, secondary, micro metadata.
pub const TITLE: f32 = 20.0;
pub const BODY: f32 = 15.0;
pub const SECONDARY: f32 = 13.0;
pub const MICRO: f32 = 11.0;

/// Tracked-out mono caps label, e.g. "TOOL REQUEST" or a section name.
pub fn eyebrow(text: impl Into<String>, color: Hsla) -> Div {
    div()
        .font_family("Menlo")
        .text_size(px(MICRO))
        .font_weight(gpui::FontWeight::SEMIBOLD)
        .text_color(color)
        .child(text.into())
}

/// Mono micro line for machine-authored metadata (ids, timestamps, counts).
pub fn meta(text: impl Into<String>, cx: &App) -> Div {
    div()
        .font_family(cx.theme().mono_font_family.clone())
        .text_size(px(MICRO))
        .text_color(cx.theme().muted_foreground)
        .child(text.into())
}

/// Push the RushDino palette into the global gpui-component theme.
///
/// Dark is forced: this is an operator console, and the palette is designed
/// for it. Components read these slots at render time, so primitives pick up
/// the brand without per-view overrides.
pub fn apply_theme(cx: &mut App) {
    Theme::change(ThemeMode::Dark, None, cx);

    let ink: Hsla = gpui::rgb(0x191714).into();
    let panel: Hsla = gpui::rgb(0x211E1A).into();
    let ridge: Hsla = gpui::rgb(0x2B2722).into();
    let bone: Hsla = gpui::rgb(0xEDE7DC).into();
    let ash: Hsla = gpui::rgb(0x9C948A).into();
    let moss: Hsla = gpui::rgb(0x8FBF6F).into();
    let amber: Hsla = gpui::rgb(0xE3A857).into();
    let brick: Hsla = gpui::rgb(0xD06A5A).into();
    let theme = Theme::global_mut(cx);
    let c = &mut theme.colors;
    c.background = ink;
    c.foreground = bone;
    c.title_bar = ink;
    c.title_bar_border = ridge;
    c.window_border = ridge;

    c.sidebar = panel;
    c.sidebar_border = ridge;
    c.sidebar_foreground = bone;
    c.sidebar_accent = gpui::rgb(0x2A2E23).into();
    c.sidebar_accent_foreground = bone;
    c.sidebar_primary = moss;
    c.sidebar_primary_foreground = ink;

    c.border = ridge;
    c.input = panel;
    c.popover = panel;
    c.popover_foreground = bone;
    c.muted = gpui::rgb(0x262320).into();
    c.muted_foreground = ash;
    c.accent = ridge;
    c.accent_foreground = bone;
    c.secondary = ridge;
    c.secondary_foreground = bone;
    c.secondary_hover = gpui::rgb(0x332E28).into();
    c.secondary_active = ridge;
    c.selection = gpui::rgb(0x33422A).into();
    c.ring = gpui::rgb(0x5C7A4A).into();

    c.primary = moss;
    c.primary_foreground = gpui::rgb(0x16200F).into();
    c.primary_hover = gpui::rgb(0x9DCB80).into();
    c.primary_active = gpui::rgb(0x7FAD61).into();
    c.link = moss;
    c.link_hover = gpui::rgb(0x9DCB80).into();
    c.success = moss;
    c.success_foreground = gpui::rgb(0x16200F).into();

    c.warning = amber;
    c.warning_foreground = gpui::rgb(0x241A0B).into();
    c.warning_hover = gpui::rgb(0xEBB56B).into();
    c.warning_active = gpui::rgb(0xD19A48).into();

    c.danger = brick;
    c.danger_foreground = gpui::rgb(0x2A120D).into();
    c.danger_hover = gpui::rgb(0xDA7A6B).into();
    c.danger_active = gpui::rgb(0xC05C4D).into();

    c.scrollbar_thumb = ridge;
    c.scrollbar_thumb_hover = gpui::rgb(0x3A352E).into();
    c.overlay = gpui::rgb(0x121009).into();

    theme.font_size = px(BODY);
    theme.mono_font_size = px(12.0);
    theme.radius = px(6.0);
    theme.radius_lg = px(10.0);
}
