# Nourish for iOS and Android

An Expo / React Native companion using gluestack-ui core 5. The native app has a
daily diary, food search with serving/gram controls, meal logging/removal, 7-day /
30-day / 6-month trends, and editable calorie/macro goals. It calls the existing
Nourish API at `https://nourish-api.fly.dev` by default, so the same Auth0 account
sees the same data on web and mobile.

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
   nourish://YOUR_AUTH0_DOMAIN/ios/com.nourish.tracker/callback
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
Open the installed **Nourish** app to connect to Metro. Scanning the QR code in
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
mobile/ios/Nourish.xcworkspace -scheme Nourish -showdestinations` from the repository
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
`pnpm mobile --clear`, then reload the installed Nourish app.

For temporary device testing, run the updated production API locally using the
root README's `pnpm build` / `pnpm start` instructions, then expose its port with
`cloudflared tunnel --url http://127.0.0.1:5180` (use the API's actual port).
Copy the generated HTTPS origin into `mobile/.env`. The API must load all seven
server auth settings and use the same initialized database as the web app; when
running from another checkout, point Wrangler's `--persist-to` at the web app's
existing `.wrangler/state` directory. Keep the API, tunnel, and Metro running.
[Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
are temporary: a new tunnel gets a new URL, which must also be updated in the app.

The configured app IDs are `com.nourish.tracker`, and the scheme is `nourish`.
Change them in `app.config.ts` and update Auth0's URLs before distributing under
your own app identity. `eas.json` includes development (iOS simulator), preview
(internal device), and production profiles. Supply the three public Auth0 variables
to the corresponding EAS environment; set `EXPO_PUBLIC_API_URL` only when overriding
the Fly.io deployment. Native signing, EAS project linking, and store
submission are separate from this repository's web/Docker release pipeline.

## Verify

```bash
pnpm test
pnpm --filter @nourish/mobile typecheck
pnpm lint:mobile
pnpm --filter @nourish/mobile export
pnpm exec playwright install chromium
pnpm test:mobile:ui
```

The browser interaction test runs the **real Expo/React Native screens and
gluestack components**, replacing Auth0 and HTTP responses with isolated fixtures.
It exercises sign-in, food search/scaling/add/remove, coupled goals, trends, and
logout at phone size. `NOURISH_UI_TEST=1` is set only by its dedicated server
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
