import SwiftUI

struct ComposerView: View {
  @Bindable var store: AppStore

  var body: some View {
    GlassEffectContainer(spacing: 10) {
      HStack(alignment: .bottom, spacing: 10) {
        TextField("Message RushDino", text: $store.composerText, axis: .vertical)
          .textFieldStyle(.plain)
          .lineLimit(1...6)
          .onSubmit { Task { await store.sendMessage() } }

        Button {
          Task { await store.sendMessage() }
        } label: {
          Group {
            if store.isSending {
              ProgressView()
                .controlSize(.small)
            } else {
              Image(systemName: "arrow.up")
            }
          }
          .frame(width: 18, height: 18)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.circle)
        .disabled(
          store.composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || store.isSending
        )
        .accessibilityLabel(store.isSending ? "Sending" : "Send")
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 13)
      .rushDinoComposerGlass()
    }
    .frame(maxWidth: 760)
    .frame(maxWidth: .infinity)
  }
}
