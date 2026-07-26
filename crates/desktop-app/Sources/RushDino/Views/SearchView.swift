import SwiftUI

struct SearchView: View {
  @Bindable var store: AppStore

  private var results: [ConversationSummary] {
    guard !store.searchText.isEmpty else { return store.conversations }
    return store.conversations.filter {
      $0.title.localizedStandardContains(store.searchText)
    }
  }

  var body: some View {
    List(results) { conversation in
      Button {
        store.selection = .conversation(conversation.id)
      } label: {
        Label(conversation.title, systemImage: "bubble.left")
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .buttonStyle(.plain)
    }
    .overlay {
      if results.isEmpty {
        ContentUnavailableView.search(text: store.searchText)
      }
    }
    .searchable(text: $store.searchText, prompt: "Search conversations")
  }
}
