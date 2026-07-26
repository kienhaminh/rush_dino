import Foundation

enum JSONValue: Codable, Hashable, Sendable {
  case object([String: JSONValue])
  case array([JSONValue])
  case string(String)
  case number(Double)
  case bool(Bool)
  case null

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([String: JSONValue].self) {
      self = .object(value)
    } else {
      self = .array(try container.decode([JSONValue].self))
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .object(let value): try container.encode(value)
    case .array(let value): try container.encode(value)
    case .string(let value): try container.encode(value)
    case .number(let value): try container.encode(value)
    case .bool(let value): try container.encode(value)
    case .null: try container.encodeNil()
    }
  }

  subscript(key: String) -> JSONValue? {
    guard case .object(let object) = self else { return nil }
    return object[key]
  }

  var stringValue: String? {
    switch self {
    case .string(let value): value
    case .number(let value): value.formatted()
    case .bool(let value): value ? "Yes" : "No"
    default: nil
    }
  }

  var isEmptyInput: Bool {
    switch self {
    case .string(let value): value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    case .array(let value): value.isEmpty
    case .null: true
    default: false
    }
  }

  var objectValue: [String: JSONValue]? {
    guard case .object(let value) = self else { return nil }
    return value
  }

  var arrayValue: [JSONValue]? {
    guard case .array(let value) = self else { return nil }
    return value
  }

  var displayTitle: String {
    for key in ["title", "name", "label", "message", "tool", "id"] {
      if let value = self[key]?.stringValue, !value.isEmpty { return value }
    }
    return "Item"
  }

  var displaySubtitle: String? {
    for key in ["description", "status", "state", "target", "updatedAt", "createdAt"] {
      if let value = self[key]?.stringValue, !value.isEmpty { return value }
    }
    return nil
  }

  var collectionItems: [JSONValue] {
    if let arrayValue { return arrayValue }
    for key in ["items", "pending", "recent", "facts", "profiles"] {
      if let items = self[key]?.arrayValue { return items }
    }
    if let columns = self["columns"]?.objectValue {
      return columns.keys.sorted().flatMap { columns[$0]?.arrayValue ?? [] }
    }
    return objectValue == nil ? [] : [self]
  }

  var prettyPrinted: String {
    guard
      let data = try? JSONEncoder.pretty.encode(self),
      let text = String(data: data, encoding: .utf8)
    else { return "" }
    return text
  }
}

extension JSONEncoder {
  fileprivate static let pretty: JSONEncoder = {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    return encoder
  }()
}
