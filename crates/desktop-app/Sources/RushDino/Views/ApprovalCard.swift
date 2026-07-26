import SwiftUI

struct ApprovalCard: View {
  @Bindable var store: AppStore
  let approval: PendingApproval

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Label("Approval needed", systemImage: "checkmark.shield")
        .font(.headline)
      Text("RushDino wants to run \(approval.tool).")
      Text(approval.arguments.prettyPrinted)
        .font(.system(.caption, design: .monospaced))
        .textSelection(.enabled)
        .frame(maxHeight: 160)

      HStack {
        Spacer()
        Button("Deny", role: .destructive) {
          Task { await store.decideApproval(approval, approved: false) }
        }
        Button("Approve") {
          Task { await store.decideApproval(approval, approved: true) }
        }
        .buttonStyle(.borderedProminent)
      }
    }
    .padding(14)
    .background(.orange.opacity(0.08), in: .rect(cornerRadius: 14))
    .overlay {
      RoundedRectangle(cornerRadius: 14)
        .stroke(.orange.opacity(0.25))
    }
  }
}
