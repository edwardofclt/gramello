#!/usr/bin/env bash
set -euo pipefail

siri_source_dir="$(cd "$(dirname "$0")" && pwd)"
siri_expo_header="$siri_source_dir/../../node_modules/expo-sqlite/vendor/sqlite3/sqlite3.h"
if [[ ! -f "$siri_expo_header" ]]; then
  echo 'Install workspace dependencies before checking Siri against Expo SQLite.' >&2
  exit 1
fi
siri_module_dir="$(mktemp -d)"
trap 'rm -rf "$siri_module_dir"' EXIT
ln -s "$siri_expo_header" "$siri_module_dir/sqlite3.h"
# Import the actual vendored C API without building UIKit-dependent Expo pods.
cat > "$siri_module_dir/module.modulemap" <<'MODULE'
module ExpoSQLite {
  header "sqlite3.h"
  export *
}
MODULE
# ExpoModulesProvider uses this explicit access level in the app target.
printf 'internal import ExpoSQLite\n' > "$siri_module_dir/ExpoProviderImport.swift"
siri_sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"
xcrun --sdk iphonesimulator swiftc -typecheck -warnings-as-errors \
  -target arm64-apple-ios16.4-simulator -sdk "$siri_sdk" \
  -I "$siri_module_dir" "$siri_module_dir/ExpoProviderImport.swift" \
  "$siri_source_dir"/Sources/GramelloSiri/*.swift
