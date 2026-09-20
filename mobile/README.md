# Gramello for iOS, Android, and web

An Expo / React Native companion using gluestack-ui core 5. The native app has a
daily diary, food search with serving/gram controls, meal logging/removal, 7-day /
30-day / 6-month trends, and editable calorie/macro goals. It calls the existing
Gramello API at `https://nourish-api.fly.dev` by default, so the same Auth0 account
sees the same data on web and mobile.

## Barcode scanning

In **Add food**, choose **Scan barcode**, allow camera access, and center a
packaged food's UPC-A, EAN-8, EAN-13, or ITF-14 barcode. You can also enter the
printed number manually. Open Food Facts supplies the product details; review
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

With the public environment values configured, run `pnpm --filter @nourish/mobile
web`. Live browser login requires the browser origin to be configured in Auth0;
cross-origin API requests also require an API gateway with appropriate CORS
support, or deployment of the app and API on the same origin. The browser tests
below use isolated Auth0/API fixtures, not a live account.

The diary date and trend range are retained when switching views. Chart values
can be inspected with pointer hover, touch, or the previous/next day buttons.
Charts and averages use logged days, matching the original web app.

## Connect Auth0 and the API

1. In the **existing Auth0 tenant**, create a **Native Application**, and enable
   the same database/social connections used by the web application. Use the
   same account and connection to retain the same Auth0 `sub`. Do not reuse the
   web application client ID or put its client secret in the mobile app.
2. Register an Auth0 **API** with identifier `https://nourish-api` (or your chosen
   stable identifier), signing algorithm **RS256**, the **Auth0 token profile**,
   and **Allow Offline Access**. Enable Authorization Code and Refresh Token
   grants for the Native Application; enable refresh-token rotation. If API
   application access policies require approval, authorize the Native Application.
3. In the Native Application's **Allowed Callback URLs** and **Allowed Logout
   URLs**, add both URLs below, replacing `YOUR_AUTH0_DOMAIN` with the same domain
   used by the web server. All values must be lowercase:

   ```text
   nourish://YOUR_AUTH0_DOMAIN/ios/com.edwardofclt.nourish/callback
   nourish://YOUR_AUTH0_DOMAIN/android/com.nourish.tracker/callback
   ```

4. In the **server's** `.env.local` or runtime bindings, retain all existing web
   auth settings and add `AUTH0_AUDIENCE=https://nourish-api` and
   `AUTH0_MOBILE_CLIENT_ID=<native client ID>`. Rebuild/restart the API with this
   change; the updated Wrangler config declares these bindings. A native token's
   signature, issuer, audience, expiration, subject, and client are verified before
   accessing the existing diary. Web cookie authentication still requires CSRF
   origin checks.
5. Copy `mobile/.env.example` to `mobile/.env` and fill the three **public Auth0**
   values. The app defaults to `https://nourish-api.fly.dev`; leave
   `EXPO_PUBLIC_API_URL` as supplied or unset it to use that deployment. Override
   it only to use another API origin, with no `/api` suffix. Existing `.env`
   files pointing to a temporary tunnel must be updated or have this override
   removed. The audience/domain/native client ID must match the server.
   `AUTH0_SECRET` and `AUTH0_CLIENT_SECRET` must never appear here.

The Auth0 SDK uses Universal Login with authorization code + PKCE, restores and
refreshes credentials using the OS-backed secure credentials manager, and clears
local credentials on logout/session expiry. The server keys all data by verified
`sub`, never by an email or client-provided user ID. The native app does not copy
web cookies. Password/social options are controlled in Auth0, as on the web.

## Run on a simulator or device

From the repository root, with Node.js 22.13+ and pnpm 11.25:

```bash
pnpm install
cp mobile/.env.example mobile/.env
# Fill mobile/.env and configure the Auth0 URLs above first.
pnpm mobile:ios
# Or, with an Android emulator/device and Android SDK:
pnpm mobile:android
```

`expo run:ios` needs Xcode and CocoaPods; `expo run:android` needs Android Studio /
SDK and a compatible JDK. They generate ignored native projects and install a
development build. **Expo Go cannot run react-native-auth0**. On later runs, start
Metro with `pnpm mobile`, then open the installed development build. Rebuild it
after changing the Auth0 domain, scheme, bundle ID, or native dependencies.

For a physical iPhone, connect and unlock it, trust the Mac if prompted, then run
`pnpm mobile:ios --device` and select the phone. Xcode must have a development
signing team configured; the phone may also prompt you to enable Developer Mode.
Open the installed **Gramello** app to connect to Metro. Scanning the QR code in
**Expo Go** cannot load Auth0 and produces `A0Auth0 could not be found`; reloading
JavaScript cannot add a native module to Expo Go. A simulator build also cannot
be installed on a physical phone.

If `xcodebuild` exits with code 70 and says an iOS platform is not installed,
install the platform required by your selected Xcode before retrying:

```bash
xcodebuild -downloadPlatform iOS
pnpm mobile:ios --device
```

Choose an available iPhone simulator from the device picker. An existing simulator
can appear in `xcrun simctl list devices` while Xcode still reports it as an
ineligible build destination. Check eligibility with `xcodebuild -workspace
mobile/ios/Gramello.xcworkspace -scheme Gramello -showdestinations` from the repository
root. Apple also provides the download in **Xcode > Settings > Components**; see
[Apple's component installation guide](https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components).

The deployed Fly.io API works on physical phones and simulators without a local
API or tunnel. For local API work, override `EXPO_PUBLIC_API_URL`: iOS Simulator
can use `http://localhost:5173`, and Android Emulator can use
`http://10.0.2.2:5173`, with the web API running and reachable. HTTP is restricted
to these loopback/emulator origins in development; production requires HTTPS.

On a physical phone, `localhost` refers to the phone itself. A successful Auth0
login does not prove that the phone can reach the diary API. Set
`EXPO_PUBLIC_API_URL=https://nourish-api.fly.dev` and restart Metro with
`pnpm mobile --clear`, then reload the installed Gramello app.

For temporary device testing, run the updated production API locally using the
root README's `pnpm build` / `pnpm start` instructions, then expose its port with
`cloudflared tunnel --url http://127.0.0.1:5180` (use the API's actual port).
Copy the generated HTTPS origin into `mobile/.env`. The API must load all seven
server auth settings and use the same initialized database as the web app; when
running from another checkout, point Wrangler's `--persist-to` at the web app's
existing `.wrangler/state` directory. Keep the API, tunnel, and Metro running.
[Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
are temporary: a new tunnel gets a new URL, which must also be updated in the app.

The iOS bundle ID is `com.edwardofclt.nourish`, the Android package is
`com.nourish.tracker`, and the scheme is `nourish`. Update Auth0's callback and
logout URLs whenever changing these IDs in `app.config.ts`. These identifiers
are intentionally retained for the Gramello branding trial so existing installs,
Auth0 callbacks, and the linked EAS project continue to work.
`eas.json` includes development (iOS simulator), preview
(internal device), and production profiles. The production profile includes the
public Auth0 and Fly.io settings. Supply the public Auth0 variables separately for
development and preview builds. Keep all client secrets out of mobile configuration.

## TestFlight

The Apple Developer App ID is `com.edwardofclt.nourish`, under team `6SHL6PHRS9`.
The App Store Connect record is
[Gramello: Calories & Macros](https://appstoreconnect.apple.com/apps/6814035327/distribution)
(Apple ID `6814035327`). The App Store Connect name is saved as
**Gramello: Calories & Macros**; new builds display **Gramello**.
`eas.json` targets this record with the production submission profile. The linked
Expo project is [@edwardofclt/nourish-mobile](https://expo.dev/accounts/edwardofclt/projects/nourish-mobile).
Apple distribution signing and App Store Connect submission credentials are
managed by EAS. The native Auth0 application's callback and logout allowlists include
`nourish://dev-rgk5sso4.auth0.com/ios/com.edwardofclt.nourish/callback`.

### GitHub releases

Every stable release published by the **Release** workflow calls
`.github/workflows/testflight.yml`. Publishing a stable release manually in GitHub
also triggers it. The job checks out the exact release tag, sets the mobile
package version from that tag, builds on EAS, and submits to TestFlight. EAS
increments the iOS build number remotely so reruns use a new build number. The
GitHub job waits for both build and submission and fails if either fails.

The repository's `EXPO_TOKEN` Actions secret belongs to the **nourish-github**
Expo robot with the Developer role. Rotate that token in Expo and replace the
GitHub secret if needed. No Apple passwords or signing keys are stored in this
repository. If Apple signing credentials expire, repair them with
`npx eas-cli@24.7.0 credentials:configure-build --platform ios --profile production`
from `mobile/` before rerunning the workflow.

To rebuild an existing stable release, choose **Actions > TestFlight > Run workflow**
and enter its tag (for example, `v1.2.0`). Prereleases and drafts are excluded.
The explicit call from the Release workflow is required because releases created
with `GITHUB_TOKEN` don't trigger another release-event workflow.

For a manual build of your current checkout, sign in to Expo and run from `mobile/`:

```bash
npx eas-cli@24.7.0 build --platform ios --profile production --auto-submit
```

Use the production profile for TestFlight; the preview profile uses internal
device distribution. After Apple processes the uploaded build, it can be tested
through the app's **Internal Testing** group in TestFlight, with automatic build
distribution enabled. Submission does not release the app publicly. See
[Expo's TestFlight guide](https://docs.expo.dev/submit/testflight/).

## Verify

```bash
pnpm test
pnpm --filter @nourish/mobile typecheck
pnpm lint:mobile
pnpm --filter @nourish/mobile export
pnpm --filter @nourish/mobile exec expo export --platform web
pnpm exec playwright install chromium
pnpm test:mobile:ui
```

The browser interaction test runs the **real Expo/React Native screens and
gluestack components**, replacing Auth0 and HTTP responses with isolated fixtures.
It exercises sign-in, food search/scaling/add/remove, coupled goals, trends, and
logout at phone and desktop sizes, plus tablet/narrow layouts, short dialogs,
Escape/focus restoration, and chart inspection. `MOBILE_TEST_PORT=8087 pnpm
test:mobile:ui` selects another port when 8082 is occupied.
`NOURISH_UI_TEST=1` is set only by its dedicated server
configuration; do not set it for normal development or builds. It does not prove
native browser callbacks or secure storage: verify login, restart/restore,
refresh, and logout on both devices with your configured Auth0 tenant.

Expo and Metro are pinned to compatible patches that satisfy the repository's
seven-day dependency-release policy. `expo install --check` may recommend newer
patches before that window has passed. `EXPO_OFFLINE=1 pnpm --filter
@nourish/mobile exec expo install --check` checks the installed SDK's matrix.

UI code is in `src/screens`, gluestack-based controls in `src/components/ui.tsx`,
Auth0/session coordination in `src/auth`, and API/calendar/nutrition helpers in
`src/lib`. Goal calculations are shared with the web app's `app/goal-math.ts`.
No diary data or access/refresh tokens are persisted in ordinary app storage.
