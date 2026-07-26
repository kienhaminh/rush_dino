import Foundation

final class ChatWebSocketClient: @unchecked Sendable {
  private let lock = NSLock()
  private var socket: URLSessionWebSocketTask?
  private var eventHandler: (@Sendable (ChatSocketEvent) -> Void)?

  func connect(
    baseURL: URL,
    authenticationSecret: Data,
    onEvent: @escaping @Sendable (ChatSocketEvent) -> Void
  ) {
    disconnect()
    var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: true)!
    components.scheme = components.scheme == "https" ? "wss" : "ws"
    components.path = "/api/ws/chat"

    var request = URLRequest(url: components.url!)
    request.setValue(
      HMACRequestSigner(secret: authenticationSecret).authorization(
        method: "GET",
        path: components.path
      ),
      forHTTPHeaderField: "Authorization"
    )
    let socket = URLSession.shared.webSocketTask(with: request)
    lock.withLock {
      self.socket = socket
      self.eventHandler = onEvent
    }
    socket.resume()
    receiveNext()
  }

  func send(
    message: String,
    conversationID: String?,
    profileID: String?,
    thinkingMode: String?
  ) async throws {
    let payload: [String: Any?] = [
      "message": message,
      "conversation_id": conversationID,
      "profile_id": profileID,
      "thinking_mode": thinkingMode,
    ]
    let compact = payload.compactMapValues { $0 }
    let data = try JSONSerialization.data(withJSONObject: compact)
    let text = String(decoding: data, as: UTF8.self)
    guard let socket = lock.withLock({ self.socket }) else {
      throw URLError(.notConnectedToInternet)
    }
    try await socket.send(.string(text))
  }

  func sendApproval(requestID: String, approved: Bool) async throws {
    let payload: [String: Any] = [
      "type": "approval_response",
      "request_id": requestID,
      "approved": approved,
    ]
    let data = try JSONSerialization.data(withJSONObject: payload)
    guard let socket = lock.withLock({ self.socket }) else {
      throw URLError(.notConnectedToInternet)
    }
    try await socket.send(.string(String(decoding: data, as: UTF8.self)))
  }

  func disconnect() {
    let oldSocket = lock.withLock { () -> URLSessionWebSocketTask? in
      defer {
        socket = nil
        eventHandler = nil
      }
      return socket
    }
    oldSocket?.cancel(with: .goingAway, reason: nil)
  }

  private func receiveNext() {
    guard let socket = lock.withLock({ self.socket }) else { return }
    socket.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let message):
        if let event = self.parse(message) {
          self.lock.withLock { self.eventHandler }?(event)
        }
        self.receiveNext()
      case .failure(let error):
        self.lock.withLock { self.eventHandler }?(.failure(error.localizedDescription))
      }
    }
  }

  private func parse(_ message: URLSessionWebSocketTask.Message) -> ChatSocketEvent? {
    let data: Data
    switch message {
    case .data(let value): data = value
    case .string(let value): data = Data(value.utf8)
    @unknown default: return nil
    }
    guard let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return nil
    }

    let type = payload["type"] as? String
    let conversationID = payload["conversation_id"] as? String
    switch type {
    case "chat_chunk":
      return .chunk(payload["delta"] as? String ?? "", conversationID: conversationID)
    case "assistant_message":
      return .completed(payload["content"] as? String, conversationID: conversationID)
    case "assistant_reset", "session_reset":
      return .reset
    case "tool_start":
      return .tool(name: payload["tool_name"] as? String ?? "Tool", completed: false)
    case "tool_end":
      return .tool(name: payload["tool_name"] as? String ?? "Tool", completed: true)
    case "approval_request":
      return .approval(
        PendingApproval(
          requestID: payload["request_id"] as? String ?? "",
          tool: payload["tool"] as? String ?? "Tool",
          arguments: jsonValue(from: payload["args"]) ?? .null
        )
      )
    case "approval_result":
      return .approvalResolved(requestID: payload["request_id"] as? String ?? "")
    case "input_request":
      let decoder = JSONDecoder()
      guard let request = try? decoder.decode(PendingInputRequest.self, from: data) else {
        return .failure("Received an invalid input request")
      }
      return .inputRequest(request)
    case "error":
      return .failure(payload["message"] as? String ?? "Unknown server error")
    default:
      return nil
    }
  }

  private func jsonValue(from value: Any?) -> JSONValue? {
    guard let value, JSONSerialization.isValidJSONObject(["value": value]),
      let data = try? JSONSerialization.data(withJSONObject: ["value": value]),
      let object = try? JSONDecoder().decode([String: JSONValue].self, from: data)
    else { return nil }
    return object["value"]
  }
}
