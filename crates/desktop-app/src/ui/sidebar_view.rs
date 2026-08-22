//! Sidebar navigation: new chat, quick destinations, recent conversations,
//! and workspace sections.

use gpui::{App, Context, Entity, FontWeight, IntoElement, ParentElement as _, Styled as _, div, px};
use gpui_component::{
    button::{Button, ButtonVariants as _},
    sidebar::{Sidebar, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuItem},
    ActiveTheme as _, h_flex, IconName, Sizable as _, v_flex,
};

use crate::{
    models::Destination,
    store::{AppStore, Selection},
    ui::{AppView, tokens},
};

/// Render the left sidebar.
pub fn render(store_entity: Entity<AppStore>, cx: &Context<AppView>) -> impl IntoElement {
    let store = store_entity.read(cx);

    let mut quick = SidebarMenu::new();
    if store.is_sending {
        quick = quick.child(SidebarMenuItem::new("New chat").icon(IconName::File).disable(true));
    } else {
        quick = quick.child(new_chat_item(store_entity.clone()));
    }
    for destination in [Destination::Search, Destination::Automations, Destination::Kanban] {
        quick = quick.child(destination_item(store, store_entity.clone(), destination));
    }

    let mut recent = SidebarMenu::new();
    for conversation in store.conversations.iter() {
        let id = conversation.id.clone();
        let active = matches!(
            &store.selection,
            Some(Selection::Conversation(selected)) if *selected == id
        );
        recent = recent.child(
            SidebarMenuItem::new(conversation.title.clone())
                .active(active)
                .on_click({
                    let store = store_entity.clone();
                    move |_, _, cx: &mut App| {
                        store.update(cx, |store, _| store.select_conversation(&id));
                    }
                }),
        );
    }

    let mut workspace = SidebarMenu::new();
    for destination in [
        Destination::Agents,
        Destination::Sessions,
        Destination::Workflows,
        Destination::KnowledgeGraph,
        Destination::Approvals,
        Destination::Logs,
    ] {
        workspace = workspace.child(destination_item(store, store_entity.clone(), destination));
    }

    Sidebar::left()
        .header(
            SidebarHeader::new().child(
                h_flex()
                    .px_3()
                    .py_2()
                    .gap_2()
                    .items_center()
                    .child(
                        div()
                            .w(px(8.0))
                            .h(px(8.0))
                            .rounded_full()
                            .bg(cx.theme().primary),
                    )
                    .child(
                        div()
                            .text_size(px(14.0))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("RushDino"),
                    ),
            ),
        )
        .footer(
            SidebarFooter::new().child(
                v_flex()
                    .gap_1()
                    .child({
                        let live = store.booted && store.error.is_none();
                        h_flex()
                            .px_2()
                            .py_1()
                            .gap_2()
                            .items_center()
                            .child(
                                div()
                                    .size(px(6.0))
                                    .rounded_full()
                                    .bg(if live {
                                        cx.theme().success
                                    } else {
                                        cx.theme().warning
                                    }),
                            )
                            .child(tokens::meta(if live { "Connected" } else { "Starting…" }, cx))
                    })
                    .child(
                        Button::new("settings")
                            .ghost()
                            .small()
                            .label("Settings")
                            .icon(IconName::Settings)
                            .on_click({
                                let store = store_entity.clone();
                                move |_, _, cx: &mut App| {
                                    store.update(cx, |store, _| store.open_settings());
                                }
                            }),
                    ),
            ),
        )
        .child(SidebarGroup::new("").child(quick))
        .child(SidebarGroup::new("Recent").child(recent))
        .child(SidebarGroup::new("Workspace").child(workspace))
}

fn new_chat_item(store_entity: Entity<AppStore>) -> SidebarMenuItem {
    SidebarMenuItem::new("New chat")
        .icon(IconName::File)
        .on_click(move |_, _, cx: &mut App| {
            store_entity.update(cx, |store, _| store.new_chat());
        })
}

fn destination_item(
    store: &AppStore,
    store_entity: Entity<AppStore>,
    destination: Destination,
) -> SidebarMenuItem {
    let active = matches!(
        &store.selection,
        Some(Selection::Workspace(selected)) if *selected == destination
    );
    SidebarMenuItem::new(destination.title())
        .icon(destination_icon(destination))
        .active(active)
        .on_click(move |_, _, cx: &mut App| {
            store_entity.update(cx, |store, _| store.load_destination(destination));
        })
}

fn destination_icon(destination: Destination) -> IconName {
    match destination {
        Destination::Chat => IconName::File,
        Destination::Search => IconName::Search,
        Destination::Automations => IconName::Calendar,
        Destination::Kanban => IconName::LayoutDashboard,
        Destination::Agents => IconName::User,
        Destination::Sessions => IconName::Inbox,
        Destination::Workflows => IconName::Replace,
        Destination::KnowledgeGraph => IconName::Globe,
        Destination::Approvals => IconName::CircleCheck,
        Destination::Logs => IconName::SquareTerminal,
    }
}
