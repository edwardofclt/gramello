#!/usr/bin/env bash
set -euo pipefail
widget_dir="$(cd "$(dirname "$0")" && pwd)"
widget_sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"
xcrun --sdk iphonesimulator swiftc -typecheck -warnings-as-errors \
  -target arm64-apple-ios16.4-simulator -sdk "$widget_sdk" \
  "$widget_dir/../siri/Sources/GramelloSiri/WidgetSnapshot.swift" \
  "$widget_dir/ios/GramelloWidgets.swift"
