import Foundation

struct CronJob: Decodable, Identifiable, Hashable, Sendable {
  let id: String
  let name: String
  let description: String
  let enabled: Bool
  let state: String
  let nextRunAt: String?
}

struct KanbanBoard: Decodable, Sendable {
  let columns: KanbanColumns
}

struct KanbanColumns: Decodable, Sendable {
  let backlog: [KanbanTask]
  let claimed: [KanbanTask]
  let inProgress: [KanbanTask]
  let blocked: [KanbanTask]
  let inReview: [KanbanTask]
  let done: [KanbanTask]
  let failed: [KanbanTask]

  var ordered: [(String, [KanbanTask])] {
    [
      ("Backlog", backlog),
      ("Claimed", claimed),
      ("In Progress", inProgress),
      ("Blocked", blocked),
      ("In Review", inReview),
      ("Done", done),
      ("Failed", failed),
    ]
  }
}

struct KanbanTask: Decodable, Identifiable, Hashable, Sendable {
  let id: String
  let title: String
  let description: String
  let status: String
  let assignedAgent: String?
  let priority: String
}
