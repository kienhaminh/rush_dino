import SwiftUI

struct SidebarView: View {
  @Bindable var store: AppStore
  @SceneStorage("rushdino.workspace.expanded") private var workspaceExpanded = false

  private var filteredConversations: [ConversationSummary] {
    guard !store.searchText.isEmpty else { return store.conversations }
    return store.conversations.filter {
      $0.title.localizedCaseInsensitiveContains(store.searchText)
    }
  }

  var body: some View {
    List(selection: $store.selection) {
      Section {
        Button {
          store.newChat()
        } label: {
          Label("New chat", systemImage: "square.and.pencil")
        }
        .buttonStyle(.plain)
        .disabled(store.isSending)

        destinationRow(.search)
        destinationRow(.automations)
        destinationRow(.kanban)
      }

      Section("Recent") {
        if filteredConversations.isEmpty {
          Text("No chats yet")
            .foregroundStyle(.tertiary)
        } else {
          ForEach(filteredConversations) { conversation in
            Text(conversation.title)
              .lineLimit(1)
              .tag(SidebarSelection.conversation(conversation.id))
              .contextMenu {
                Button("Open") {
                  store.selection = .conversation(conversation.id)
                }
              }
          }
        }
      }

      Section {
        DisclosureGroup("Workspace", isExpanded: $workspaceExpanded) {
          ForEach([
            WorkspaceDestination.agents,
            .sessions,
            .workflows,
            .knowledgeGraph,
            .approvals,
            .logs,
          ]) { destination in
            destinationRow(destination)
          }
        }
      }
    }
    .listStyle(.sidebar)
    .safeAreaInset(edge: .bottom) {
      SettingsLink {
        Label("Settings", systemImage: "gearshape")
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 10)
          .padding(.vertical, 8)
      }
      .buttonStyle(.plain)
      .padding(8)
    }
  }

  private func destinationRow(_ destination: WorkspaceDestination) -> some View {
    Label(destination.title, systemImage: destination.systemImage)
      .tag(SidebarSelection.workspace(destination))
  }
}
