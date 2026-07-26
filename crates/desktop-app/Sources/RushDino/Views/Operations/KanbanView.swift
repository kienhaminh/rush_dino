import SwiftUI

struct KanbanView: View {
  let store: AppStore

  var body: some View {
    Group {
      if let board = store.kanbanBoard {
        ScrollView(.horizontal) {
          HStack(alignment: .top, spacing: 12) {
            ForEach(board.columns.ordered, id: \.0) { title, tasks in
              KanbanColumn(title: title, tasks: tasks)
            }
          }
          .padding(18)
        }
      } else {
        ContentUnavailableView(
          "No Tasks",
          systemImage: "rectangle.split.3x1",
          description: Text("Agent tasks will appear here.")
        )
      }
    }
    .toolbar {
      Button {
        Task { await store.loadDestination(.kanban) }
      } label: {
        Label("Refresh", systemImage: "arrow.clockwise")
      }
    }
  }
}

private struct KanbanColumn: View {
  let title: String
  let tasks: [KanbanTask]

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text(title)
          .font(.headline)
        Spacer()
        Text(tasks.count, format: .number)
          .foregroundStyle(.secondary)
          .monospacedDigit()
      }

      ForEach(tasks) { task in
        VStack(alignment: .leading, spacing: 7) {
          Text(task.title)
            .fontWeight(.medium)
          if !task.description.isEmpty {
            Text(task.description)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(3)
          }
          HStack {
            Text(task.priority.capitalized)
            Spacer()
            if let agent = task.assignedAgent { Text(agent) }
          }
          .font(.caption2)
          .foregroundStyle(.tertiary)
        }
        .padding(12)
        .background(.background.secondary, in: .rect(cornerRadius: 12))
      }
    }
    .frame(width: 250, alignment: .top)
    .padding(12)
    .background(.quaternary, in: .rect(cornerRadius: 16))
  }
}
