import SwiftUI

extension View {
  func rushDinoComposerGlass() -> some View {
    glassEffect(.regular.interactive(), in: .rect(cornerRadius: 22))
  }
}
