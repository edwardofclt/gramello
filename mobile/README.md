# Gramello for iOS, Android, and web

**Native iOS/Android now run locally with SQLite and no sign-in.** Settings holds daily calorie, macro, and water goals, including the preferred water unit. Water logging stays in the diary. Food catalogs update automatically; **Settings → Advanced** offers an immediate update check, complete backup export/import, CSV export, and recovery after replacement. See [local-data setup and publishing](../docs/client-only-implementation.md). The browser edition also opens directly, with a hosted diary tied to that browser's anonymous cookie.

Production Android builds produce Play Store AABs. GitHub APK distribution is manual. Catalog signing setup is required before the first downloadable catalog release.

An Expo / React Native app using gluestack-ui core 5, with a daily diary,
food search, recipes, water tracking, trends, and editable nutrition goals.
Native builds use local SQLite; the browser edition uses the hosted API.

## Siri macro check-in (iOS)

After installing a native build with this feature, open Gramello once and say:
**“Hey Siri, give me my macro check-in in Gramello.”** You can also run
**Shortcuts → App Shortcuts → Gramello → Macro check-in**. Settings includes the
voice phrase. Siri requests device authentication when necessary.

The check-in compares logged-day averages for calories, protein, carbs, and fat
against current daily goals over the **seven completed local calendar days before
today**. Days without entries are excluded, and Siri reports how many days had
entries. Logging something does not establish that the whole day was logged; the
response explicitly notes that logs may be incomplete. Unsaved goals are labeled
as defaults. Goal history is not stored, so previous goals are not inferred.

This is a read-only App Intent with a calculated spoken response. It uses no LLM,
API key, AI service, or new runtime dependency. It supports the app's existing
iOS minimum (16.4+) and does not require Apple Intelligence. Siri's own availability
and processing depend on system settings. Arbitrary questions without the app's
name are not guaranteed to invoke this shortcut.

The Expo config plugin `plugins/withSiriCheckIn.cjs` installs the Swift files from
`native/siri/Sources/GramelloSiri` into the generated main app target, including
App Intents metadata. **Rebuild the native app**; Expo Go and OTA JavaScript
updates cannot add this capability. No SiriKit extension or App Group is needed.
The intent opens Expo's personal SQLite database in read-only mode and reads a
transactional snapshot, so edits, imports, and recovery are reflected on the next
invocation without maintaining a second copy of the diary. No personal content is
indexed into Spotlight or sent to analytics by the intent.

On macOS with Xcode, run `pnpm --filter @gramello/mobile test:siri` for native
SQLite and summary tests. `pnpm test` includes the config-plugin integration test.
Run `pnpm --filter @gramello/mobile test:siri:ios` to compile-check against Expo's
actual SQLite headers and the iOS simulator SDK. The Siri CI workflow runs both
native checks. A full native build additionally verifies linking and shortcut metadata.
The reader must be reviewed when the local storage filename, schema, default
goals, or SQLite configuration changes.

Before release, verify on a physical iPhone with the installed native build:

1. Run the shortcut with no prior diary, then with entries on several prior days.
2. Compare the spoken numbers against the diary and current goals; check that
   today and days with no entries are excluded.
3. Change goals, delete an entry, import a backup, and restore the previous diary;
   invoke again after each operation and verify fresh results.
4. Invoke while the app is closed and while the device is locked; verify the
   authentication prompt and spoken response.
5. Test each published phrase with Siri, plus the shortcut from Shortcuts. Natural
   language routing must be tested on-device even when compilation and unit tests pass.

## Siri meal and snack suggestions (iOS)

Say **“Hey Siri, suggest an easy meal in Gramello”** or **“Hey Siri, suggest an easy
snack in Gramello.”** You can also use **Shortcuts → App Shortcuts → Gramello →
Meal or snack idea**, or add **Suggest an easy meal or snack** to a shortcut and
choose its **Meal or snack** parameter. Settings lists both voice phrases.

Each invocation reads today's entries and current goals from the same local,
read-only SQLite snapshot used by the macro check-in. Today follows the device's
current timezone. Remaining amounts are goals minus logged intake; yesterday and
future entries are excluded. An empty day is identified, and unsaved goals are
explicitly described as defaults. No suggestion is logged automatically.

The intent chooses one of 11 built-in quick ideas, including yogurt, cottage
cheese, tuna toast, and chicken or chickpea rice bowls. It gives ingredient weights,
simple preparation instructions, and estimated calories, protein, carbs, and fat.
Ready-cooked ingredients keep the bowls and egg toast quick. Nutrition comes from
the USDA records already in `data/food-catalog/usda-core.json`; the Swift catalog
retains their IDs. Brand differences, added ingredients, and actual portions can
change the nutrition. Dietary preferences and allergies are not stored or filtered;
review the stated ingredients for your needs.

Only options that fit **all four** remaining amounts qualify, using unrounded
values. Normal and half portions are considered, with a 200-calorie minimum for
meals and a 50-calorie minimum for snacks. Among matches, the intent favors reducing
the largest remaining fractions of daily goals, with a stable order for ties. An
already-exceeded target prevents a fit. When no option qualifies, Siri says so
without implying that food should be skipped; a meal request can suggest asking for
a snack. These are estimates based on logged food, which may be incomplete.

The feature runs on-device with no new runtime dependency, LLM, network call, diary
write, or analytics event. It uses device authentication, supports iOS 16.4+, and
requires a **native rebuild**, like the macro check-in. Parameterized shortcut
phrases follow Apple's [App Shortcuts](https://developer.apple.com/documentation/appintents/appshortcut)
and [AppEnum](https://developer.apple.com/documentation/appintents/app-enums) APIs.

The same native tests, iOS compile check, and config-plugin integration test above
cover this intent. Before release on a physical iPhone, verify both voice phrases
and the Shortcuts parameter, compare a suggestion with today's remaining amounts,
then edit goals or entries and invoke again. Also check an empty diary, a budget
with no matching option, local midnight, and a locked device. Full native builds
and on-device invocation remain necessary to verify Siri routing and presentation.

## More Siri diary actions (iOS)

These actions use the same native build and device authentication as the check-in.
Say the app's name in the phrase; **Settings → Ask Siri** lists examples. All dates
use the device's local calendar and timezone.

| Action | Example phrase | Behavior |
| --- | --- | --- |
| Remaining macros | “What macros do I have left today in Gramello?” | Reports remaining calories, protein, carbs, and fat; explicitly reports any amount over a goal. |
| Today's summary | “Give me today's summary in Gramello.” | Reports logged intake against current goals. “How much protein have I logged today in Gramello?” selects one nutrient; calories, carbs, and fat also work. |
| Log water | “Log water in Gramello.” | Asks for amount and unit (milliliters or US fluid ounces), then logs today. Shortcuts can supply both parameters. |
| Log saved meal | “Log a saved meal in Gramello.” | Asks which meal from My meals and which diary meal (breakfast, lunch, dinner, snacks). Defaults to one serving; the Shortcuts action supports fractional or multiple servings. |
| Repeat yesterday | “Add yesterday's lunch to today in Gramello.” | Copies every logged entry from that meal yesterday to the same meal today. Breakfast, dinner, and snacks work too. |

Saved meals are resolved by their persistent ID and read again before logging, so
edits are respected and a deleted meal is not logged from a stale shortcut. Siri
can search saved names when it asks which meal to use; duplicate names remain
separate choices. No saved names are proactively donated or indexed in Spotlight.
Recipe nutrition matches the app's weight, volume, and per-serving calculations,
including measured batch yield. A repeated meal preserves its original logged
nutrition and portions, even if the saved recipe has changed or was deleted.

The three logging actions write to the existing personal SQLite database using
Expo's SQLite runtime, an independent connection, and `BEGIN IMMEDIATE`
transactions. They never create or migrate a diary. Unknown schema versions,
invalid input, and a busy database fail without logging. Repeating a meal commits
all entries together or rolls back all of them. Existing entries are retained;
**each successful invocation adds new entries**, so running a shortcut twice logs
twice. Entries can be removed through the regular diary UI. The app reloads its
diary when returning to the foreground; pull to refresh if needed.

Water uses the existing 1–10,000 mL input bounds and exact US-fluid-ounce
conversion. These are product input limits, not intake recommendations. Read-only
summaries identify empty logs and default goals. No intent sends analytics or
makes a network call; Siri's system processing follows the device's settings.

`pnpm test tests/mobile-siri-storage.test.ts` compiles the actual Swift sources on
macOS and checks their writes through the JavaScript repository, recipe math,
backup import/export, and deletion paths. This test is skipped on Linux and run
by the Siri CI workflow on macOS. Native tests also cover rollback after a partial
copy, write contention, missing diaries, local dates, and invalid amounts.

Before release, use an installed native build on an iPhone to check all phrases
and Shortcuts parameters, a locked device, ambiguous/deleted saved meals, one and
fractional servings, both water units, empty yesterday meals, and app refresh
after Siri writes. A native rebuild is required; an OTA update cannot add intents.

## Anonymous usage analytics

iOS and Android use [Segment Analytics React Native](https://github.com/segmentio/analytics-react-native).
Set `EXPO_PUBLIC_SEGMENT_WRITE_KEY` in `mobile/.env` to a Segment React Native
source's **write key**. Leaving it unset or blank disables analytics. The public
production write key is configured in `eas.json`; the iOS `production` and Android
`production-apk` profiles both use it. To disable analytics in those builds,
remove that variable or set it to an empty string. Use a separate Segment
source/key for development. This key is bundled in the app; never use a Segment
workspace access token here.

Rebuild the native app with `pnpm mobile:ios` or `pnpm mobile:android` (or EAS)
after installing the new native dependencies. An OTA JavaScript update alone
cannot add these modules. Segment supports development builds, not Expo Go.
The Expo browser build and the marketing website do not send these events.

Segment generates a random `anonymousId` and persists it using Sovran and
AsyncStorage. It survives app restarts and is never derived from email or a
hardware identifier. Each installation has its own analytics identity. Clearing
app storage creates a new ID; restoring a device backup can restore the stored ID. There are no `identify`,
`alias`, or account traits calls.

| Events | When recorded |
| --- | --- |
| Application Installed / Updated / Opened / Backgrounded | Segment's native lifecycle hooks |
| Welcome, Diary, Trends, Settings, Advanced, Add Food, Goals | Screen changes, including returning from the food sheet |
| Food Searched / Barcode Looked Up | Successful lookup; no query or barcode |
| Food Logged / Removed, Custom Food Created, Meal Created / Updated / Deleted | Successful local writes |
| Goals Updated, Water Logged / Removed, Water Goal Updated | Successful local writes |

`src/analytics/events.ts` filters every event before delivery. Only fixed event
and screen names, the anonymous ID, event ID/time, app name/version/build/bundle
ID, OS name/version, and SDK name/version survive. All event properties, account
IDs/traits, food and meal details, nutrition/water values, diary dates, device
identifiers/names, location, locale, timezone, and deep links are excluded.
`context.ip` is set to `0.0.0.0` to prevent IP enrichment in analytics events;
Segment still receives the network connection. See
[Segment's IP anonymization guidance](https://www.twilio.com/docs/segment/connections/sources/catalog/libraries/mobile/android#anonymizing-ip).

SDK errors never block app actions. Segment queues events locally and retries
delivery using its default flush settings. Only the Segment destination is
installed in the app; review cloud destinations configured on the source before
enabling it. Keep this source restricted to anonymous product analytics.

Verification: `pnpm test`, `pnpm --filter @gramello/mobile typecheck`,
`pnpm lint:mobile`, and `pnpm --filter @gramello/mobile export`. With a real write
key and rebuilt native app, check the Segment source debugger: open the diary,
log food/water and close/reopen the app. Confirm `anonymousId`
remains stable, `userId` and traits are absent, properties are empty, and the IP
is `0.0.0.0`. Failed local writes should not appear as successful actions. Repeat
on both iOS and Android. Update App Store privacy disclosures for the next
analytics-enabled build; see `docs/app-store-preparation.md`.


## Barcode scanning

In **Add food**, choose **Scan barcode**, allow camera access, and center a
packaged food's UPC-A, EAN-8, EAN-13, or ITF-14 barcode. You can also enter the
printed number manually. Native lookup checks installed and previously cached
foods first, then queries Open Food Facts directly and saves successful matches
for offline use. The bundled catalog includes all previously imported restaurant
menus. Typing a food name automatically searches on-device foods and Open Food Facts;
online matches are saved for offline use. If a database is unavailable, tap the warning
for the affected source and failure details. The hosted browser uses Open Food Facts. Review
the serving size and meal before adding. Unknown products or products without
complete nutrition can be searched by name instead. Drinks with volume-based
nutrition support servings, mL, and US fluid ounces; their diary entries display
the selected amount without inventing a weight.

The native scanner uses `expo-camera`. **Rebuild the development app** with
`pnpm mobile:ios` or `pnpm mobile:android` after installing these changes so the
camera module and permission configuration are included. No microphone access
is requested. Native camera scanning requires a physical device; test permission
denial, scanning, closing the sheet, and background/foreground transitions there.
Browser scanning uses the same scanner as the original web app and needs HTTPS
or localhost. Both stop the camera when leaving the scanner or entering a code.

`pnpm test:mobile:ui` covers camera denial, manual lookup, unknown products,
serving calculations, cancellation, and real barcode decoding from a simulated
camera stream. `pnpm test` covers barcode normalization and product/API handling.

## Browser experience

The Expo browser UI follows the original web app's design: a desktop sidebar and
header, horizontal energy summary, two-column meal diary, centered food/goal
dialogs, and calorie and macro trend charts. Below 761px it switches to a
single-column diary and bottom navigation. iOS and Android use the shared screens
with native safe areas, keyboard handling, and page sheets.

Run `pnpm --filter @gramello/mobile web` to open the Expo browser UI. The diary
opens without login. Serve the browser UI and its `/api` requests on one origin,
using a reverse proxy when the Expo and API servers run separately. The browser
tests below use isolated API fixtures.

The diary date and trend range are retained when switching views. Chart values
can be inspected with pointer hover, touch, or the previous/next day buttons.
Charts and averages use logged days, matching the original web app.

## Hosted browser setup

Native builds require no API environment variables or running server. For the
browser edition, copy `mobile/.env.example` to `mobile/.env` if needed.
`EXPO_PUBLIC_API_URL` is optional and defaults to the current browser origin;
keep any override on that same origin. Configure the API server's `APP_BASE_URL`
to match the browser origin. Cross-origin API requests are not supported.

The API creates an HttpOnly `gramello_diary` cookie automatically. That cookie
keeps each browser's hosted diary separate. Clearing it, using another browser,
or opening a new private browsing session creates a separate diary; there is no
account or recovery login. Clearing the cookie does not delete the server's
records. Data from older account-based versions remains untouched and is not
assigned to anonymous diaries. Native SQLite data and backups are independent
of hosted browser data.

## Run on a simulator or device

From the repository root, with Node.js 24 and pnpm 11.25:

```bash
pnpm install --frozen-lockfile
pnpm mobile:ios
# Or, with an Android emulator/device and Android SDK:
pnpm mobile:android
```

Native builds need no account configuration or running API. `expo run:ios` needs
Xcode and CocoaPods; `expo run:android` needs Android Studio / SDK and a compatible
JDK. Both generate ignored native projects. On later runs, start Metro with
`pnpm mobile`, then open the installed development build. Rebuild after changing
native dependencies. Use a development build instead of Expo Go.

For a physical iPhone, connect and unlock it, trust the Mac, and run
`pnpm mobile:ios --device`. Xcode needs a development signing team. The phone may
ask you to enable Developer Mode. To install a missing iOS platform, use Xcode >
Settings > Components or `xcodebuild -downloadPlatform iOS`.

Bundle ID `com.edwardofclt.nourish`, Android package `com.nourish.tracker`, and
scheme `nourish` are retained so existing installs and the linked EAS project
continue to work. `eas.json` provides development (iOS simulator), preview
(internal devices), production (store), and production-apk profiles.

## Store builds and manual APKs

Stable releases call **TestFlight** for an iOS build/submission and **Android store bundle** for an AAB. The Android workflow builds without submitting; Google
Play service-account setup and upload remain release tasks. Set a paid-download
price in each store console; there is no subscription or entitlement server.

The workflows use the existing `EXPO_TOKEN` secret. Keep iOS and Android signing
credentials in EAS; never commit them. Repair expired Apple credentials with
`npx eas-cli@24.7.0 credentials:configure-build --platform ios --profile production`
from `mobile/`. Before the first Android CI build, provision its keystore with:

```bash
cd mobile
npx eas-cli@24.7.0 build --platform android --profile production
```

Retain the keystore so subsequent releases can update installed apps. TestFlight
submission does not release the app publicly. The store profiles contain no
hosted API environment values.

For direct APK distribution, manually run **Android APK (manual distribution)**
in Actions with a stable release tag containing the `production-apk` profile.
It builds a signed APK and attaches it to that release. Stable releases no longer
start APK builds automatically. APKs are for direct installation; Play uses AABs.

Catalog publication is separate from binary releases. Follow
[signing and publication setup](../docs/client-only-implementation.md) before the
first release. The bundled catalog works offline before that setup is complete.

## Verify

```bash
pnpm test
pnpm --filter @gramello/mobile typecheck
pnpm lint:mobile
pnpm --filter @gramello/mobile export
pnpm --filter @gramello/mobile exec expo export --platform web
pnpm exec playwright install chromium
pnpm test:mobile:ui
```

The browser interaction test runs the **real Expo/React Native screens and
gluestack components**, replacing HTTP responses with isolated fixtures.
It exercises direct diary startup, food search/scaling/add/remove, coupled goals,
and trends at phone and desktop sizes, plus tablet/narrow layouts, short dialogs,
Escape/focus restoration, and chart inspection. `MOBILE_TEST_PORT=8087 pnpm
test:mobile:ui` selects another port when 8082 is occupied.
`GRAMELLO_UI_TEST=1` is set only by its dedicated server
configuration; do not set it for normal development or builds. Native file pickers, share destinations, restart persistence, and catalog
download interruption also need checks on physical iOS and Android devices.

Expo and Metro are pinned to compatible patches that satisfy the repository's
seven-day dependency-release policy. `expo install --check` may recommend newer
patches before that window has passed. `EXPO_OFFLINE=1 pnpm --filter
@gramello/mobile exec expo install --check` checks the installed SDK's matrix.

UI code is in `src/screens`, gluestack-based controls in `src/components/ui.tsx`,
diary data providers in `src/diary`, and API/calendar/nutrition helpers in
`src/lib`. Goal calculations are shared with the web app's `app/goal-math.ts`.
Native personal data is persisted in SQLite under `src/local`; catalog code lives
in `src/catalog`. All platforms open without login.
