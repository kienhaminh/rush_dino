import Foundation

enum WorkspaceDestination: String, CaseIterable, Identifiable, Sendable {
  case chat
  case search
  case automations
  case kanban
  case agents
  case sessions
  case workflows
  case knowledgeGraph
  case approvals
  case logs

  var id: String { rawValue }

  var title: String {
    switch self {
    case .chat: "New chat"
    case .search: "Search"
    case .automations: "Automations"
    case .kanban: "Kanban"
    case .agents: "Agents"
    case .sessions: "Sessions"
    case .workflows: "Workflows"
    case .knowledgeGraph: "Knowledge Graph"
    case .approvals: "Approvals"
    case .logs: "Logs"
    }
  }

  var systemImage: String {
    switch self {
    case .chat: "square.and.pencil"
    case .search: "magnifyingglass"
    case .automations: "clock"
    case .kanban: "rectangle.split.3x1"
    case .agents: "person.2"
    case .sessions: "bubble.left.and.bubble.right"
    case .workflows: "point.3.connected.trianglepath.dotted"
    case .knowledgeGraph: "circle.hexagongrid"
    case .approvals: "checkmark.shield"
    case .logs: "text.alignleft"
    }
  }

  var apiPath: String? {
    switch self {
    case .agents: "/api/agents"
    case .sessions: "/api/sessions"
    case .workflows: "/api/workflows"
    case .knowledgeGraph: "/api/graph/facts"
    case .approvals: "/api/approvals"
    case .logs: "/api/logs?limit=200"
    default: nil
    }
  }
}

enum SidebarSelection: Hashable, Sendable {
  case workspace(WorkspaceDestination)
  case conversation(String)
}
