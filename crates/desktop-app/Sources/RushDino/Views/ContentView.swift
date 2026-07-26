import SwiftUI

struct ContentView: View {
  @Bindable var store: AppStore
  @State private var columnVisibility = NavigationSplitViewVisibility.all

  var body: some View {
    NavigationSplitView(columnVisibility: $columnVisibility) {
      SidebarView(store: store)
        .navigationSplitViewColumnWidth(min: 210, ideal: 236, max: 280)
    } detail: {
      detail
        .navigationTitle(detailTitle)
    }
    .task(id: store.selection) {
      guard let selection = store.selection else { return }
      switch selection {
      case .conversation(let id):
        await store.selectConversation(id)
      case .workspace(let destination):
        await store.loadDestination(destination)
      }
    }
    .alert(
      "RushDino",
      isPresented: Binding(
        get: { store.errorMessage != nil },
        set: { if !$0 { store.errorMessage = nil } }
      )
    ) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(store.errorMessage ?? "")
    }
  }

  @ViewBuilder
  private var detail: some View {
    switch store.selection {
    case .conversation, .workspace(.chat), nil:
      ChatView(store: store)
    case .workspace(.search):
      SearchView(store: store)
    case .workspace(.automations):
      AutomationsView(store: store)
    case .workspace(.kanban):
      KanbanView(store: store)
    case .workspace(let destination):
      ResourceListView(destination: destination, resource: store.resource)
    }
  }

  private var detailTitle: String {
    switch store.selection {
    case .conversation(let id):
      store.conversations.first(where: { $0.id == id })?.title ?? "Chat"
    case .workspace(let destination):
      destination.title
    case nil:
      "RushDino"
    }
  }
}
