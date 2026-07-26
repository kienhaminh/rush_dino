import Darwin
import Foundation

@MainActor
final class BackendProcessController {
  static let shared = BackendProcessController()

  private(set) var process: Process?
  private(set) var baseURL: URL?
  private(set) var authenticationSecret: Data?
  private var logPipe: Pipe?

  func start() async throws -> URL {
    if let baseURL, await isHealthy(baseURL) { return baseURL }

    let port = try availablePort()
    let url = URL(string: "http://127.0.0.1:\(port)")!
    let helper = try helperExecutableURL()
    let secret = Data((0..<32).map { _ in UInt8.random(in: .min ... .max) })
    let secretHex = secret.map { String(format: "%02x", $0) }.joined()

    let process = Process()
    process.executableURL = helper
    process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
    process.environment = ProcessInfo.processInfo.environment.merging([
      "RUSHDINO_HOST": "127.0.0.1",
      "RUSHDINO_PORT": String(port),
      "RUSHDINO_SECURITY__DASHBOARD_AUTH_ENABLED": "false",
      "RUSHDINO_SECURITY__HMAC_AUTH_ENABLED": "true",
      "RUSH_DINO_API_SECRET": secretHex,
      "RUSH_DINO_TRANSIENT_CONFIG": "1",
      "RUST_LOG": "info",
    ]) { _, new in new }

    let pipe = Pipe()
    pipe.fileHandleForReading.readabilityHandler = { handle in
      if handle.availableData.isEmpty {
        handle.readabilityHandler = nil
      }
    }
    process.standardOutput = pipe
    process.standardError = pipe
    try process.run()

    self.process = process
    self.baseURL = url
    self.authenticationSecret = secret
    self.logPipe = pipe

    for _ in 0..<80 {
      if await isHealthy(url) { return url }
      if !process.isRunning {
        stop()
        throw CocoaError(.executableRuntimeMismatch)
      }
      try await Task.sleep(for: .milliseconds(125))
    }
    stop()
    throw URLError(.cannotConnectToHost)
  }

  func stop() {
    guard let process else { return }
    if process.isRunning {
      process.terminate()
      process.waitUntilExit()
    }
    logPipe?.fileHandleForReading.readabilityHandler = nil
    try? logPipe?.fileHandleForReading.close()
    self.process = nil
    baseURL = nil
    authenticationSecret = nil
    logPipe = nil
  }

  private func isHealthy(_ baseURL: URL) async -> Bool {
    guard let url = URL(string: "/healthz", relativeTo: baseURL) else { return false }
    var request = URLRequest(url: url)
    request.timeoutInterval = 0.5
    guard
      let (_, response) = try? await URLSession.shared.data(for: request),
      let http = response as? HTTPURLResponse
    else { return false }
    return 200..<300 ~= http.statusCode
  }

  private func helperExecutableURL() throws -> URL {
    if let bundled = Bundle.main.url(forResource: "rushdino-server", withExtension: nil) {
      return bundled
    }

    let repositoryBuild = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
      .appending(path: "../target/debug/rushdino-server")
      .standardizedFileURL
    if FileManager.default.isExecutableFile(atPath: repositoryBuild.path) {
      return repositoryBuild
    }
    throw CocoaError(.executableNotLoadable)
  }

  private func availablePort() throws -> UInt16 {
    let descriptor = socket(AF_INET, SOCK_STREAM, 0)
    guard descriptor >= 0 else { throw POSIXError(.EIO) }
    defer { close(descriptor) }

    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = in_port_t(0)
    address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))

    let result = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        bind(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    guard result == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }

    var bound = sockaddr_in()
    var length = socklen_t(MemoryLayout<sockaddr_in>.size)
    let readResult = withUnsafeMutablePointer(to: &bound) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        getsockname(descriptor, $0, &length)
      }
    }
    guard readResult == 0 else { throw POSIXError(.EIO) }
    return UInt16(bigEndian: bound.sin_port)
  }
}
