import Foundation

struct ListResponse<Item: Decodable>: Decodable {
  let items: [Item]
}

struct ConversationSummary: Decodable, Identifiable, Hashable, Sendable {
  let id: String
  let title: String
}

struct ConversationDetail: Decodable, Sendable {
  let id: String
  let messages: [ChatMessage]
}

struct ChatMessage: Decodable, Identifiable, Hashable, Sendable {
  let id: String
  let role: ChatRole
  var content: String
  let createdAt: String?

  init(
    id: String = UUID().uuidString,
    role: ChatRole,
    content: String,
    createdAt: String? = nil
  ) {
    self.id = id
    self.role = role
    self.content = content
    self.createdAt = createdAt
  }

  private enum CodingKeys: String, CodingKey {
    case id, role, content
    case createdAt
  }
}

enum ChatRole: String, Decodable, Sendable {
  case system
  case user
  case assistant
  case tool
}

enum ChatSocketEvent: Sendable {
  case chunk(String, conversationID: String?)
  case completed(String?, conversationID: String?)
  case reset
  case tool(name: String, completed: Bool)
  case approval(PendingApproval)
  case approvalResolved(requestID: String)
  case inputRequest(PendingInputRequest)
  case failure(String)
}

struct PendingApproval: Identifiable, Sendable {
  let requestID: String
  let tool: String
  let arguments: JSONValue

  var id: String { requestID }
}

struct PendingInputRequest: Decodable, Identifiable, Sendable {
  let requestID: String
  let payload: InputRequestPayload

  var id: String { requestID }

  private enum CodingKeys: String, CodingKey {
    case requestID = "request_id"
    case payload
  }

  var initialValues: [String: JSONValue] {
    Dictionary(
      uniqueKeysWithValues: payload.spec.fields.compactMap { field in
        if let defaultValue = field.defaultValue {
          return (field.name, defaultValue)
        }
        guard field.required == true else { return nil }
        return (field.name, field.emptyValue)
      }
    )
  }

  func submissionValues(from values: [String: JSONValue]) -> [String: JSONValue] {
    Dictionary(
      uniqueKeysWithValues: payload.spec.fields.compactMap { field in
        guard let value = values[field.name] else { return nil }
        if field.required != true, value.isEmptyInput {
          return nil
        }
        return (field.name, value)
      }
    )
  }
}

struct InputRequestPayload: Decodable, Sendable {
  let spec: InputRequestSpec
}

struct InputRequestSpec: Decodable, Sendable {
  let title: String
  let description: String?
  let submitLabel: String?
  let cancelLabel: String?
  let fields: [InputFieldSpec]
}

struct InputFieldSpec: Decodable, Identifiable, Sendable {
  let name: String
  let label: String
  let description: String?
  let fieldType: InputFieldType
  let required: Bool?
  let placeholder: String?
  let defaultValue: JSONValue?
  let min: Double?
  let max: Double?
  let minLength: Int?
  let maxLength: Int?
  let options: [InputFieldOption]?
  let secret: Bool?

  var id: String { name }

  var emptyValue: JSONValue {
    switch fieldType {
    case .boolean: .bool(false)
    case .multiselect: .array([])
    case .number: required == true ? .number(0) : .string("")
    case .select: .string(required == true ? options?.first?.value ?? "" : "")
    default: .string("")
    }
  }

  private enum CodingKeys: String, CodingKey {
    case name, label, description, required, placeholder, defaultValue
    case min, max, minLength, maxLength, options, secret
    case fieldType = "type"
  }
}

struct InputFieldOption: Decodable, Identifiable, Sendable {
  let label: String
  let value: String

  var id: String { value }
}

enum InputFieldType: String, Decodable, Sendable {
  case text
  case textarea
  case select
  case multiselect
  case boolean
  case number
}

struct HealthResponse: Decodable, Sendable {
  let status: String
  let provider: String?
}
