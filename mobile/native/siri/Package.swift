// swift-tools-version: 5.9
import PackageDescription

// The same sources are compiled into the iOS app by withSiriCheckIn.cjs.
let package = Package(
    name: "GramelloSiri",
    platforms: [.macOS(.v13), .iOS(.v16)],
    targets: [
        .target(name: "GramelloSiri", linkerSettings: [.linkedLibrary("sqlite3")]),
        .testTarget(name: "GramelloSiriTests", dependencies: ["GramelloSiri"])
    ]
)
