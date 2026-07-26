import Foundation
import Observation

@MainActor
@Observable
final class AppStore {
  var selection: SidebarSelection? = .workspace(.chat)
  var conversations: [ConversationSummary] = []
  var messages: [ChatMessage] = []
  var composerText = ""
  var searchText = ""
  var resource: JSONValue?
  var cronJobs: [CronJob] = []
  var kanbanBoard: KanbanBoard?
  var isBooting = true
  var isSending = false
  var errorMessage: String?
  var providerName: String?
  var pendingApprovals: [PendingApproval] = []
  var pendingInputRequests: [PendingInputRequest] = []
  var inputValuesByRequest: [String: [String: JSONValue]] = [:]

  private(set) var client: APIClient?
  let socket = ChatWebSocketClient()
  private var activeConversationID: String?
  private var streamingMessageID: String?

  func bootstrap() async {
    guard isBooting else { return }
    do {
      let baseURL = try await BackendProcessController.shared.start()
      guard let secret = BackendProcessController.shared.authenticationSecret else {
        throw URLError(.userAuthenticationRequired)
      }
      let client = APIClient(baseURL: baseURL, authenticationSecret: secret)
      self.client = client
      let health = try await client.get("/healthz", as: HealthResponse.self)
      providerName = health.provider
      connectSocket(baseURL, authenticationSecret: secret)
      try await refreshConversations()
    } catch {
      errorMessage = error.localizedDescription
    }
    isBooting = false
  }

  func newChat() {
    guard !isSending else { return }
    activeConversationID = nil
    messages = []
    composerText = ""
    if let client {
      connectSocket(client.baseURL, authenticationSecret: client.authenticationSecret)
    }
    selection = .workspace(.chat)
  }

  func selectConversation(_ id: String) async {
    guard let client else { return }
    do {
      let detail = try await client.get(
        "/api/conversations/\(id)",
        as: ConversationDetail.self
      )
      activeConversationID = id
      messages = detail.messages
      selection = .conversation(id)
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func sendMessage() async {
    let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, !isSending else { return }
    composerText = ""
    isSending = true
    errorMessage = nil
    messages.append(ChatMessage(role: .user, content: text))

    let responseID = UUID().uuidString
    streamingMessageID = responseID
    messages.append(ChatMessage(id: responseID, role: .assistant, content: ""))

    do {
      try await socket.send(
        message: text,
        conversationID: activeConversationID,
        profileID: nil,
        thinkingMode: "medium"
      )
    } catch {
      isSending = false
      errorMessage = error.localizedDescription
    }
  }

  func loadDestination(_ destination: WorkspaceDestination) async {
    guard let client else { return }
    errorMessage = nil
    do {
      switch destination {
      case .automations:
        cronJobs = try await client.get("/api/cron", as: ListResponse<CronJob>.self).items
      case .kanban:
        kanbanBoard = try await client.get("/api/kanban/board", as: KanbanBoard.self)
      default:
        if let path = destination.apiPath {
          resource = try await client.getJSON(path)
        }
      }
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func runCron(_ job: CronJob) async {
    guard let client else { return }
    do {
      _ = try await client.postJSON("/api/cron/\(job.id)/run")
      await loadDestination(.automations)
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func toggleCron(_ job: CronJob) async {
    guard let client else { return }
    do {
      let action = job.enabled ? "pause" : "resume"
      _ = try await client.postJSON("/api/cron/\(job.id)/\(action)")
      await loadDestination(.automations)
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func fetchJSON(_ path: String) async throws -> JSONValue {
    guard let client else { throw URLError(.notConnectedToInternet) }
    return try await client.getJSON(path)
  }

  private func refreshConversations() async throws {
    guard let client else { return }
    conversations =
      try await client
      .get("/api/conversations", as: ListResponse<ConversationSummary>.self)
      .items
  }

  private func connectSocket(_ baseURL: URL, authenticationSecret: Data) {
    socket.connect(baseURL: baseURL, authenticationSecret: authenticationSecret) {
      [weak self] event in
      Task { @MainActor in self?.handle(event) }
    }
  }

  private func handle(_ event: ChatSocketEvent) {
    switch event {
    case .chunk(let delta, let conversationID):
      if let conversationID { activeConversationID = conversationID }
      updateStreamingMessage { $0 += delta }
    case .completed(let content, let conversationID):
      if let conversationID { activeConversationID = conversationID }
      if let content, !content.isEmpty { updateStreamingMessage { $0 = content } }
      finishStreaming()
    case .reset:
      removeStreamingMessage()
    case .tool(let name, let completed):
      let suffix = completed ? " completed" : " running"
      messages.append(ChatMessage(role: .tool, content: "\(name)\(suffix)"))
    case .approval(let approval):
      if !pendingApprovals.contains(where: { $0.id == approval.id }) {
        pendingApprovals.append(approval)
      }
    case .approvalResolved(let requestID):
      pendingApprovals.removeAll { $0.requestID == requestID }
    case .inputRequest(let request):
      if !pendingInputRequests.contains(where: { $0.id == request.id }) {
        pendingInputRequests.append(request)
      }
      inputValuesByRequest[request.id] = request.initialValues
    case .failure(let message):
      errorMessage = message
      finishStreaming()
    }
  }

  private func updateStreamingMessage(_ update: (inout String) -> Void) {
    guard let id = streamingMessageID, let index = messages.firstIndex(where: { $0.id == id })
    else {
      return
    }
    update(&messages[index].content)
  }

  private func finishStreaming() {
    streamingMessageID = nil
    isSending = false
    Task { try? await refreshConversations() }
  }

  private func removeStreamingMessage() {
    if let id = streamingMessageID { messages.removeAll { $0.id == id } }
    finishStreaming()
  }

}
