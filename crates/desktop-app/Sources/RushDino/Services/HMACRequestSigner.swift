import CryptoKit
import Foundation

struct HMACRequestSigner: Sendable {
  let secret: Data

  func authorization(
    method: String,
    path: String,
    body: Data = Data(),
    timestamp: UInt64? = nil,
    nonce: String? = nil
  ) -> String {
    let timestamp = timestamp ?? UInt64(Date().timeIntervalSince1970)
    let nonce =
      nonce ?? UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    let bodyHash = SHA256.hash(data: body).map { String(format: "%02x", $0) }.joined()
    let canonical = "\(timestamp):\(nonce):\(method):\(path):\(bodyHash)"
    let signature = HMAC<SHA256>.authenticationCode(
      for: Data(canonical.utf8),
      using: SymmetricKey(data: secret)
    )
    let encoded = Data(signature).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
    return "HMAC-SHA256 \(timestamp).\(nonce).\(encoded)"
  }
}
