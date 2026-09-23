# Widget implementation validation

Implemented for iPhone/iPad Home Screen and Lock Screen, and Android Home Screen.
Widgets use the current local diary, refresh after successful mutations and Siri
writes, and open today's diary. The existing SQLite database was not moved.

## Automated checks

- Repository suite: 253 tests pass, including snapshot calculations, successful
  and failed mutations (including food edits), backup replacement/recovery, ordered publication,
  widget links, local-module discovery, and repeatable Xcode generation.
- Swift suite: 36 tests pass, including the existing Siri coverage plus widget
  snapshot validation, local midnight/DST expiry, missing diaries, and concurrent
  publication with complete-file reads.
- A native Swift/JavaScript SQLite integration verifies exact snapshot parity
  for the same diary, including Siri-created food/water records.
- Android native tests: 6 tests pass. RemoteViews inflation and a ready-to-unavailable
  accessibility transition run against API 24 and API 34; data tests cover dates,
  units, malformed snapshots, over-goal progress, and zero goals.
- Mobile and root TypeScript checks, mobile ESLint, iOS Swift compile checks, and
  iOS/Android Metro exports pass. Android module lint has zero errors; remaining
  warnings concern English strings and layout/style recommendations.
- Full iOS simulator app build succeeds with the embedded WidgetKit extension
  and Expo module, with code signing disabled.
- Full Android debug app assembly succeeds. Its packaged manifest includes both
  widget providers and their metadata. The iOS app package contains the extension
  with matching app/extension versions and the correct WidgetKit extension point.

## Defects caught during validation

The full native build caught a literal `undefined` Xcode group path and a Swift
module name collision between the extension and Expo bridge. Both have plugin
regression coverage. The extension now emits `GramelloWidgetExtension` while the
bridge keeps its module identity.

Independent review found an unsupported RemoteViews spacer, Android date APIs
above the app's API 24 minimum, and stale TalkBack descriptions after expiry.
Supported layouts and API-24-compatible date formatting replace those paths;
the rendering tests reproduce the original failures and pass with the fixes.
The reviewer checked the fixes and reported no remaining findings in that scope.

## Copilot review follow-up

- Fixed the native snapshot reader to validate complete stored food/water records
  before accumulating totals, including identity, timestamps, optional fields, and
  amounts. Global goals must have a null record date. A Swift/JavaScript SQLite
  regression matrix verifies matching acceptance and unavailable publication for
  corrupt rows.
- Expanded the native workflow filters to cover repository/session/deep-link
  integration, shared water validation, package configuration, and native tests.
- Kept Android receivers non-exported: the system AppWidgetService sends widget
  lifecycle broadcasts, and non-exported receivers still accept system broadcasts.
  See the [Android receiver contract](https://developer.android.com/guide/topics/manifest/receiver-element#exported)
  and [AppWidgetService implementation](https://github.com/aosp-mirror/platform_frameworks_base/blob/main/services/appwidget/java/com/android/server/appwidget/AppWidgetServiceImpl.java).
- Kept extension setup through node-xcode's `addTarget(..., 'app_extension', ...)`,
  which already adds the host dependency and PlugIns copy phase. The plugin test
  now verifies both relationships on the containing app after repeated prebuilds.

## Release/device checks

These local checks do not exercise signed EAS provisioning, real widget-gallery
placement, iOS tinting/Lock Screen redaction, or OS-controlled refresh delays.
On installed native builds, verify every family, Android resizing, cold and warm
widget taps, midnight/timezone changes, Siri logging while closed, backup import,
and recovery. Both iOS targets must receive the configured App Group entitlement.
An OTA update cannot install either platform's native widget integration.
