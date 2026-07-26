import Foundation

extension AppStore {
  func decideApproval(_ approval: PendingApproval, approved: Bool) async {
    do {
      try await socket.sendApproval(
        requestID: approval.requestID,
        approved: approved
      )
      pendingApprovals.removeAll { $0.id == approval.id }
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func resolveInputRequest(_ request: PendingInputRequest, submitted: Bool) async {
    guard let client else { return }
    let values = inputValuesByRequest[request.id] ?? [:]
    var body: [String: JSONValue] = [
      "status": .string(submitted ? "submitted" : "cancelled")
    ]
    if submitted {
      body["values"] = .object(request.submissionValues(from: values))
    }

    do {
      _ = try await client.postJSON(
        "/api/input-requests/\(request.requestID)",
        body: .object(body)
      )
      pendingInputRequests.removeAll { $0.id == request.id }
      inputValuesByRequest[request.id] = nil
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func inputValue(requestID: String, field: String) -> JSONValue? {
    inputValuesByRequest[requestID]?[field]
  }

  func setInputValue(_ value: JSONValue, requestID: String, field: String) {
    inputValuesByRequest[requestID, default: [:]][field] = value
  }
}
