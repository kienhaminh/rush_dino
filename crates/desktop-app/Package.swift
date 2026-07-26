// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "RushDino",
    platforms: [.macOS(.v26)],
    products: [
        .executable(name: "RushDino", targets: ["RushDino"])
    ],
    targets: [
        .executableTarget(
            name: "RushDino",
            path: "Sources/RushDino"
        ),
        .testTarget(
            name: "RushDinoTests",
            dependencies: ["RushDino"],
            path: "Tests/RushDinoTests"
        )
    ],
    swiftLanguageModes: [.v5]
)
