# Home Screen and Lock Screen widgets

Status: approved by the user and implemented. Verification results are in `docs/widgets-validation.md`.

## Outcome and scope

The requested outcome is Home Screen and Lock Screen widgets for Gramello.
The proposed first version lets someone check today's logged nutrition and water
without opening the app, then tap through to today's diary.

Confirmed platform scope: iPhone/iPad Home Screen and Lock Screen widgets,
plus Android Home Screen widgets. The proposed content is calories, protein,
carbs, fat, and water using existing goals and preferred water units. Logging
directly inside a widget is separate follow-up work.

## Widget collection

| Gallery name | Families | Content |
| --- | --- | --- |
| Today | Small and medium Home Screen | Small: calorie progress and logged/goal amounts. Medium: calories, protein, carbs, fat, and a compact water total. |
| Water | Small Home Screen; circular, rectangular, and inline Lock Screen | Logged water against the current goal, in mL or US fl oz. |
| Calories | Circular and inline Lock Screen | Logged calories and progress toward the current goal. |
| Macros | Rectangular Lock Screen | Protein, carbs, and fat totals against goals, with explicit nutrient labels. |

On Android, provide Today and Water gallery entries. Today resizes between a
compact calorie summary and a wider calorie/macro/water summary. Water shows
logged volume, goal, and a progress bar. Use size ranges rather than assuming
identical launcher grid cells across phones and tablets. Lock Screen families
in the table describe iPhone/iPad; Android Lock Screen placement is outside the
confirmed Home Screen scope.

All widgets open `nourish://diary/today`. The app must handle both cold launch
and an already-running session, select the diary tab, dismiss any open sheet,
and select the current local date even if a historical date was previously open.

Home Screen designs use Gramello's navy background, mint calorie accent, and
existing macro colors. Lock Screen designs use the system's accessory rendering.
Support system tinting, background removal, legible text sizing, and VoiceOver
labels that include nutrient, logged amount, unit, and goal. Do not rely on color
alone. Clamp visual progress to 0–100%, while keeping amounts above goal visible.
Zero macro goals render a total without a misleading percentage or division by zero.

## Approach and alternatives

Recommended: native SwiftUI/WidgetKit views on iOS and Kotlin AppWidgetProvider
with RemoteViews layouts on Android. Expo config plugins install both native
integrations during prebuild. A versioned summary contract supplies the data;
iOS stores it in an App Group and Android stores it in private app storage.
This fits the existing checked-in Swift and config-plugin approach used by Siri.
Both JavaScript-triggered iOS refreshes and Siri writes use one native publisher.

Expo Widgets is an iOS alternative with official SDK 57 support for these families
and TypeScript layouts. It adds a widget runtime and Expo UI dependencies; keeping
its timeline data current from the existing Swift Siri writes would need an
additional integration. Android would still need its own provider. Native
SwiftUI keeps the iOS data boundary under app control.

Moving the entire diary database into an App Group would allow extension reads
but requires migration and changes to existing SQLite, backup, and Siri paths.
The proposed version shares only the summary the widgets need.

## iOS components and data flow

1. A native summary reader in the app reads goals, food totals, water totals,
   and water preferences for today's local date in one SQLite read transaction.
   It reuses the existing Expo SQLite runtime and schema validation. The result
   includes schema version, date, timezone identifier, generation timestamp,
   entry-presence flags, and whether goals are saved or defaults.
2. A serialized native publisher reads the summary and atomically replaces one
   JSON file in `group.com.edwardofclt.nourish.widgets`. Serialization covers the
   read and publication so overlapping requests cannot publish an older snapshot
   after a newer one. The extension validates and reads the file without accessing
   SQLite, React Native, the catalog, or the network.
3. A small native bridge requests publication after initialization, app activation,
   successful food/water additions or deletions, goal changes, backup import, and
   recovery. Requests occur after committed writes. The three Siri logging intents
   request publication after successful writes through the same publisher.
4. A WidgetKit timeline provider supplies the current summary and an expiry entry
   at the next local midnight. Publication requests a reload of the affected
   widget timelines. iOS controls when reloads actually render.
5. An idempotent Expo config plugin adds shared source files, the widget extension,
   build phases, embedding, and matching App Group entitlements. It declares the
   extension bundle identifier `com.edwardofclt.nourish.widgets` to EAS credentials
   configuration. The extension inherits the app's supported iOS deployment floor;
   newer presentation APIs have availability checks.

The main diary remains the source of truth at its current path. Shared data
contains aggregate amounts and goals, with no food names, meal names, or IDs.
Publishing failures do not make a committed diary action appear to have failed.
The next app activation or successful relevant mutation retries publication.

## Android components and data flow

The JavaScript repository adds a summary read that obtains food totals, water
totals, goals, and preferences within one serialized SQLite read transaction.
It produces the same versioned JSON contract as iOS, verified against common
fixtures. The Android provider does not open Expo's SQLite database itself.

A small local native module accepts validated summaries, persists them with an
atomic file replacement, and updates all installed Today and Water widget IDs.
The JavaScript publication queue covers reading and dispatch so an earlier
request cannot replace a later summary. Use the same initialization, activation,
mutation, import, and recovery hooks described for iOS.

Expo autolinks the local Android module, which bundles Kotlin sources, XML
layouts, widget metadata, preview resources, and manifest receivers. Use platform RemoteViews to avoid adding a
Compose/Glance dependency for these simple read-only layouts. Widget taps use an
immutable PendingIntent targeting the app's today deep link. The native module
must autolink in Expo development and production builds, with inert web behavior.

Re-render from persisted data when widgets are added, resized, or periodically
updated. Configure the platform's 30-minute update interval and handle permitted
time/timezone broadcasts. Re-evaluate date and timezone on each render and show
the stale state when they differ. Always display the snapshot date in Android
layouts: system scheduling, battery restrictions, or force-stop can delay a
midnight update, so the last rendered values must not be labeled only “Today.”
No exact-alarm or background-location permission is needed.

## Empty, stale, and protected data

- A valid empty diary shows zero logged and an explicit empty state. Default
  goals are identified in the available text and accessibility description.
- Before initial publication, show “Open Gramello to get started.” Gallery
  previews use sample data only; samples never substitute for missing real data.
- A snapshot for a different local day or timezone is stale. Show “Open Gramello
  to refresh” instead of yesterday's values or an invented zero for today. The
  iOS midnight timeline entry expires the snapshot even if the app stays closed.
  Android uses the refresh behavior and persistent date label described above.
- If a refresh cannot read the diary, publish an unavailable state when possible.
  If the shared file cannot be updated, retain the last complete snapshot with its
  timestamp; do not imply that the previous values were just verified.
- Missing, malformed, or unsupported snapshots produce a useful unavailable
  state. Protect the iOS shared file and mark its personal amounts
  privacy-sensitive so the system can redact them according to the device's
  Lock Screen settings. Android snapshot files remain in private app storage.

## Validation and delivery

Automated coverage must exercise real summary calculations, both water units,
zero and exceeded goals, empty versus unavailable data, invalid/schema-mismatched
records, local midnight and daylight-saving boundaries, timezone changes,
atomic publication and ordered refreshes, and unavailable shared storage.

Integration coverage must verify refresh hooks for app mutations, imports,
recovery, and Siri writes; failed mutations must not publish invented changes.
Check cold/warm deep links and ensure widgets always open today. Config-plugin
tests must round-trip the generated Xcode project and verify that running twice
does not duplicate targets, files, build phases, entitlements, or EAS declarations.
Android plugin tests must verify repeatable manifest/resource/module integration;
provider tests must cover multiple widget IDs, sizing, expiry, and deep links.

Run the existing repository tests, mobile typecheck and lint, Swift tests, and
iOS compile checks. Generate and build the native iOS app plus extension to check
linking and embedding. Build the Android app to verify Kotlin compilation,
resource linking, and module registration. Verify gallery discovery, each family,
Android resizing and restart persistence, dark/tinted modes,
accessibility, locked-device redaction, midnight expiry, app edits, Siri logging,
and backup restoration on a simulator or device where supported. Record any
physical-device or signing checks that cannot be performed locally.

Document installation in mobile/README.md and add a concise platform-appropriate
Settings entry explaining how to add the widgets. Both platforms require a native
rebuild. iOS additionally needs provisioned App Group/extension capabilities;
an OTA JavaScript update cannot add the native integrations.

## Platform references

- [Apple: Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)
- [Expo: iOS App Extensions](https://docs.expo.dev/build-reference/app-extensions/)
- [Expo Widgets: supported families and configuration](https://docs.expo.dev/versions/latest/sdk/widgets/)
- [Android: App widgets overview](https://developer.android.com/develop/ui/views/appwidgets/overview)
- [Android: Advanced widget updates](https://developer.android.com/develop/ui/views/appwidgets/advanced)
- [Android: Implicit broadcast exceptions](https://developer.android.com/develop/background-work/background-tasks/broadcasts/broadcast-exceptions)
