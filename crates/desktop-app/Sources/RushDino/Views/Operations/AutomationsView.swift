import SwiftUI

struct AutomationsView: View {
  let store: AppStore

  var body: some View {
    List {
      ForEach(store.cronJobs) { job in
        HStack(spacing: 12) {
          Image(systemName: job.enabled ? "clock.badge.checkmark" : "clock.badge.xmark")
            .foregroundStyle(job.enabled ? .green : .secondary)
            .frame(width: 22)

          VStack(alignment: .leading, spacing: 3) {
            Text(job.name)
              .fontWeight(.medium)
            if !job.description.isEmpty {
              Text(job.description)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            }
          }

          Spacer()

          Text(job.state.replacingOccurrences(of: "_", with: " ").capitalized)
            .font(.caption)
            .foregroundStyle(.secondary)

          Button(job.enabled ? "Pause" : "Resume") {
            Task { await store.toggleCron(job) }
          }
          Button("Run") {
            Task { await store.runCron(job) }
          }
          .buttonStyle(.borderedProminent)
        }
        .padding(.vertical, 5)
      }
    }
    .overlay {
      if store.cronJobs.isEmpty {
        ContentUnavailableView(
          "No Automations",
          systemImage: "clock",
          description: Text("Scheduled agent jobs will appear here.")
        )
      }
    }
    .refreshable { await store.loadDestination(.automations) }
  }
}
