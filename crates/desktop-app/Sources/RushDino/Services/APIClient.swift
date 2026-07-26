import Foundation

enum APIClientError: LocalizedError {
  case invalidURL(String)
  case server(status: Int, message: String)

  var errorDescription: String? {
    switch self {
    case .invalidURL(let path): "Invalid API path: \(path)"
    case .server(let status, let message): "Server returned \(status): \(message)"
    }
  }
}

struct APIClient: Sendable {
  let baseURL: URL
  let authenticationSecret: Data

  private static let decoder: JSONDecoder = {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return decoder
  }()

  func get<Value: Decodable & Sendable>(
    _ path: String,
    as type: Value.Type = Value.self
  ) async throws -> Value {
    try await request(path, as: type)
  }

  func post<Value: Decodable & Sendable>(
    _ path: String,
    body: JSONValue? = nil,
    as type: Value.Type = Value.self
  ) async throws -> Value {
    try await request(path, method: "POST", body: body, as: type)
  }

  func getJSON(_ path: String) async throws -> JSONValue {
    try await get(path, as: JSONValue.self)
  }

  func postJSON(_ path: String, body: JSONValue? = nil) async throws -> JSONValue {
    try await post(path, body: body, as: JSONValue.self)
  }

  private func request<Value: Decodable & Sendable>(
    _ path: String,
    method: String = "GET",
    body: JSONValue? = nil,
    as type: Value.Type
  ) async throws -> Value {
    guard let url = URL(string: path, relativeTo: baseURL) else {
      throw APIClientError.invalidURL(path)
    }

    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = 30
    let encodedBody: Data
    if let body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      encodedBody = try JSONEncoder().encode(body)
      request.httpBody = encodedBody
    } else {
      encodedBody = Data()
    }
    request.setValue(
      HMACRequestSigner(secret: authenticationSecret).authorization(
        method: method,
        path: url.path,
        body: encodedBody
      ),
      forHTTPHeaderField: "Authorization"
    )

    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard 200..<300 ~= status else {
      let message = String(data: data, encoding: .utf8) ?? "Unknown server error"
      throw APIClientError.server(status: status, message: message)
    }
    return try Self.decoder.decode(type, from: data)
  }
}
