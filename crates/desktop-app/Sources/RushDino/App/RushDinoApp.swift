import AppKit
import SwiftUI

@main
struct RushDinoApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @AppStorage("rushdino.appearance") private var appearance = "system"
  @State private var store = AppStore()

  var body: some Scene {
    WindowGroup("RushDino", id: "main") {
      ContentView(store: store)
        .task { await store.bootstrap() }
        .frame(minWidth: 900, minHeight: 620)
        .preferredColorScheme(preferredColorScheme)
    }
    .defaultSize(width: 1180, height: 780)
    .windowToolbarStyle(.unified(showsTitle: false))
    .commands {
      CommandGroup(replacing: .newItem) {
        Button("New Chat") { store.newChat() }
          .keyboardShortcut("n")
          .disabled(store.isSending)
      }
      CommandMenu("RushDino") {
        Button("Search") {
          store.selection = .workspace(.search)
        }
        .keyboardShortcut("k")

        Button("Automations") {
          store.selection = .workspace(.automations)
        }
        .keyboardShortcut("a", modifiers: [.command, .shift])
      }
    }

    Settings {
      SettingsView(store: store)
        .frame(width: 620, height: 430)
        .preferredColorScheme(preferredColorScheme)
    }
  }

  private var preferredColorScheme: ColorScheme? {
    switch appearance {
    case "light": .light
    case "dark": .dark
    default: nil
    }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.regular)
    if let iconURL = Bundle.main.url(forResource: "AppIcon", withExtension: "png"),
      let icon = NSImage(contentsOf: iconURL)
    {
      NSApp.applicationIconImage = icon
    }
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationWillTerminate(_ notification: Notification) {
    MainActor.assumeIsolated {
      BackendProcessController.shared.stop()
    }
  }
}
