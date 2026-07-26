import SwiftUI

struct ResourceListView: View {
  let destination: WorkspaceDestination
  let resource: JSONValue?
  @State private var selectedItem: JSONValue?

  var body: some View {
    Group {
      if let resource {
        if resource.collectionItems.isEmpty {
          ContentUnavailableView(
            "No \(destination.title)",
            systemImage: destination.systemImage
          )
        } else {
          List(resource.collectionItems, id: \.self, selection: $selectedItem) { item in
            VStack(alignment: .leading, spacing: 3) {
              Text(item.displayTitle)
                .fontWeight(.medium)
                .lineLimit(1)
              if let subtitle = item.displaySubtitle {
                Text(subtitle)
                  .font(.caption)
                  .foregroundStyle(.secondary)
                  .lineLimit(2)
              }
            }
            .tag(item)
            .padding(.vertical, 3)
          }
        }
      } else {
        ProgressView()
      }
    }
    .inspector(
      isPresented: Binding(
        get: { selectedItem != nil },
        set: { if !$0 { selectedItem = nil } }
      )
    ) {
      ScrollView {
        Text(selectedItem?.prettyPrinted ?? "")
          .font(.system(.caption, design: .monospaced))
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding()
      }
      .inspectorColumnWidth(min: 280, ideal: 340, max: 460)
    }
  }
}
