# Gramello for iOS, Android, and web

**Native iOS/Android now run locally with SQLite and no sign-in.** Food catalogs update automatically; Settings offers an immediate update check, complete backup export/import, CSV export, and recovery after replacement. See [local-data setup and publishing](../docs/client-only-implementation.md). The Auth0 instructions below apply to the retained browser edition and legacy hosted clients.

Production Android builds produce Play Store AABs. GitHub APK distribution is manual. Catalog signing setup is required before the first downloadable catalog release.

An Expo / React Native app using gluestack-ui core 5, with a daily diary,
food search, recipes, water tracking, trends, and editable nutrition goals.
Native builds use local SQLite; the browser edition uses the hosted API.

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
AsyncStorage. It survives app restarts and sign-in/sign-out. It is never derived
from Auth0, email, or a hardware identifier. An installation is the analytics
identity: accounts sharing one installation share this ID, and the same account
on another device has a different ID. Clearing app storage creates a new ID;
restoring a device backup can restore the stored ID. There are no `identify`,
`alias`, or account traits calls.

| Events | When recorded |
| --- | --- |
| Application Installed / Updated / Opened / Backgrounded | Segment's native lifecycle hooks |
| Welcome, Diary, Trends, Settings, Add Food, Goals | Screen changes, including returning from the food sheet |
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
printed number manually. Native lookup searches the downloaded catalog; the
USDA starter contains no packaged-food barcodes, so use name search or custom
foods when a code is unknown. The hosted browser uses Open Food Facts. Review
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

With the public environment values configured, run `pnpm --filter @gramello/mobile
web`. Live browser login requires the browser origin to be configured in Auth0;
cross-origin API requests also require an API gateway with appropriate CORS
support, or deployment of the app and API on the same origin. The browser tests
below use isolated Auth0/API fixtures, not a live account.

The diary date and trend range are retained when switching views. Chart values
can be inspected with pointer hover, touch, or the previous/next day buttons.
Charts and averages use logged days, matching the original web app.

## Hosted browser authentication

Native builds require no Auth0 or API environment variables. For the retained
browser edition, copy `.env.example` to `.env` and configure its public Auth0
values and API origin. Configure the browser origin in Auth0 and allow it in
the API gateway's CORS settings. Keep secrets in the server environment only.
The existing hosted API continues to accept its configured legacy mobile clients.

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
Auth0/API environment values.

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
gluestack components**, replacing Auth0 and HTTP responses with isolated fixtures.
It exercises sign-in, food search/scaling/add/remove, coupled goals, trends, and
logout at phone and desktop sizes, plus tablet/narrow layouts, short dialogs,
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
Auth0/session coordination in `src/auth`, and API/calendar/nutrition helpers in
`src/lib`. Goal calculations are shared with the web app's `app/goal-math.ts`.
Native personal data is persisted in SQLite under `src/local`; catalog code lives
in `src/catalog`. There are no native login tokens.
