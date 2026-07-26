import XCTest

@testable import RushDino

final class JSONValueTests: XCTestCase {
  func testExtractsItemsAndDisplayFields() throws {
    let data = Data(#"{"items":[{"id":"1","name":"Research","status":"running"}]}"#.utf8)
    let value = try JSONDecoder().decode(JSONValue.self, from: data)

    XCTAssertEqual(value.collectionItems.count, 1)
    XCTAssertEqual(value.collectionItems[0].displayTitle, "Research")
    XCTAssertEqual(value.collectionItems[0].displaySubtitle, "running")
  }

  func testFlattensKanbanColumns() throws {
    let data = Data(#"{"columns":{"done":[{"title":"Ship"}],"backlog":[{"title":"Plan"}]}}"#.utf8)
    let value = try JSONDecoder().decode(JSONValue.self, from: data)

    XCTAssertEqual(value.collectionItems.map(\.displayTitle), ["Plan", "Ship"])
  }

  func testDecodesInputRequestAndBuildsInitialValues() throws {
    let data = Data(
      """
      {
        "request_id": "request-1",
        "payload": {
          "spec": {
            "kind": "form",
            "title": "Project",
            "fields": [
              {"name": "name", "label": "Name", "type": "text", "required": true},
              {
                "name": "mode",
                "label": "Mode",
                "type": "select",
                "options": [{"label": "Fast", "value": "fast"}]
              }
            ]
          }
        }
      }
      """.utf8
    )
    let decoder = JSONDecoder()

    let request = try decoder.decode(PendingInputRequest.self, from: data)

    XCTAssertEqual(request.requestID, "request-1")
    XCTAssertEqual(request.initialValues["name"], .string(""))
    XCTAssertNil(request.initialValues["mode"])
    XCTAssertEqual(
      request.submissionValues(from: request.initialValues),
      ["name": .string("")]
    )
  }

  func testHMACSignerMatchesServerWireFormat() {
    let signer = HMACRequestSigner(secret: Data("test-secret-key-32-bytes-xxxxxxxx".utf8))

    let authorization = signer.authorization(
      method: "GET",
      path: "/api/conversations",
      timestamp: 1_700_000_000,
      nonce: "abc123"
    )

    XCTAssertEqual(
      authorization,
      "HMAC-SHA256 1700000000.abc123.I7-WoWsrMf87IBoVdbIBfI-q3NbgKKF_TFhcjhUUXJ4"
    )
  }
}
