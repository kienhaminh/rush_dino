import SwiftUI

struct ChatView: View {
  @Bindable var store: AppStore

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(spacing: 18) {
          if store.messages.isEmpty {
            emptyState
          } else {
            ForEach(store.messages) { message in
              MessageRow(message: message)
                .id(message.id)
            }
            ForEach(store.pendingApprovals) { approval in
              ApprovalCard(store: store, approval: approval)
                .id(approval.id)
            }
            ForEach(store.pendingInputRequests) { request in
              InputRequestCard(store: store, request: request)
                .id(request.id)
            }
          }
        }
        .frame(maxWidth: 760)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.top, 28)
        .padding(.bottom, 120)
      }
      .safeAreaInset(edge: .bottom) {
        ComposerView(store: store)
          .padding(.horizontal, 24)
          .padding(.bottom, 16)
      }
      .onChange(of: store.messages.last?.content) {
        if let id = store.messages.last?.id {
          withAnimation(.easeOut(duration: 0.18)) {
            proxy.scrollTo(id, anchor: .bottom)
          }
        }
      }
    }
  }

  private var emptyState: some View {
    Text("How can I help?")
      .font(.system(size: 28, weight: .semibold))
      .frame(maxWidth: .infinity, minHeight: 390)
  }
}

private struct MessageRow: View {
  let message: ChatMessage

  var body: some View {
    HStack {
      if message.role == .user { Spacer(minLength: 90) }
      Group {
        if message.role == .assistant {
          Text(markdown)
            .textSelection(.enabled)
        } else {
          Text(message.content)
            .textSelection(.enabled)
        }
      }
      .padding(message.role == .user ? 12 : 0)
      .background(message.role == .user ? AnyShapeStyle(.quaternary) : AnyShapeStyle(.clear))
      .clipShape(.rect(cornerRadius: 16))
      .foregroundStyle(message.role == .tool ? .secondary : .primary)
      .font(message.role == .tool ? .caption : .body)
      if message.role != .user { Spacer(minLength: 90) }
    }
    .frame(maxWidth: .infinity)
  }

  private var markdown: AttributedString {
    (try? AttributedString(markdown: message.content)) ?? AttributedString(message.content)
  }
}
