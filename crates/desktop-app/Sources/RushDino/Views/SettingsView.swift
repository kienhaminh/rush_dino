import AppKit
import SwiftUI

struct SettingsView: View {
  let store: AppStore
  @AppStorage("rushdino.appearance") private var appearance = "system"
  @State private var profiles: JSONValue?
  @State private var channels: JSONValue?
  @State private var config: JSONValue?

  var body: some View {
    TabView {
      general
        .tabItem { Label("General", systemImage: "gearshape") }
      appearanceSettings
        .tabItem { Label("Appearance", systemImage: "paintbrush") }
      JSONSettingsPane(title: "Models", value: profiles)
        .tabItem { Label("Models", systemImage: "cpu") }
        .task { profiles = try? await store.fetchJSON("/api/profiles") }
      JSONSettingsPane(title: "Channels", value: channels)
        .tabItem { Label("Channels", systemImage: "message") }
        .task { channels = try? await store.fetchJSON("/api/gateway/adapters") }
      JSONSettingsPane(title: "Privacy", value: config?["security"])
        .tabItem { Label("Privacy", systemImage: "hand.raised") }
        .task { config = try? await store.fetchJSON("/api/config") }
    }
    .scenePadding()
  }

  private var general: some View {
    Form {
      Section("Runtime") {
        LabeledContent(
          "Status",
          value: store.isBooting ? "Starting" : (store.client == nil ? "Unavailable" : "Connected")
        )
        LabeledContent("Provider", value: store.providerName ?? "Unavailable")
      }
      Section {
        Button("Open RushDino Data Folder") {
          let url = FileManager.default.homeDirectoryForCurrentUser
            .appending(path: ".rushdino")
          NSWorkspace.shared.open(url)
        }
      }
    }
    .formStyle(.grouped)
  }

  private var appearanceSettings: some View {
    Form {
      Picker("Appearance", selection: $appearance) {
        Text("System").tag("system")
        Text("Light").tag("light")
        Text("Dark").tag("dark")
      }
      .pickerStyle(.segmented)
    }
    .formStyle(.grouped)
  }
}

private struct JSONSettingsPane: View {
  let title: String
  let value: JSONValue?

  var body: some View {
    ScrollView {
      if let value {
        Text(value.prettyPrinted)
          .font(.system(.caption, design: .monospaced))
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
      } else {
        ProgressView()
          .frame(maxWidth: .infinity, minHeight: 240)
      }
    }
    .navigationTitle(title)
  }
}
