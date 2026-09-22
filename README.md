# Gramello

A self-hostable calorie and macro tracker with a fast daily diary, precise serving and weight controls, goal tracking, and 7-day, 30-day, and 6-month analytics.

The source repository is [edwardofclt/gramello](https://github.com/edwardofclt/gramello).
For product help and data requests, see [support](docs/support.md) and the
[privacy policy](docs/privacy.md). App Store preparation is tracked in
[the release checklist](docs/app-store-preparation.md).

Food search combines:

- [USDA FoodData Central](https://fdc.nal.usda.gov/) for generic and branded foods
- [Open Food Facts](https://world.openfoodfacts.org/) for its open, community-maintained product database and images
- A small built-in USDA reference fallback for common staples

Choose **Add food → Scan barcode** to scan a packaged food with your camera or
type the printed barcode. Gramello looks up the exact product in Open Food Facts,
then opens the amount controls for review before saving. UPC-A,
EAN-8, EAN-13, and ITF-14 product codes are supported. Browser camera access
requires HTTPS (or localhost); manual entry works without camera permission.
Unknown products and incomplete nutrition offer a return to name search.
Volume-based products, including drinks, support servings, mL, and US fluid
ounces. Weight-based foods retain servings, grams, and ounces by weight. Open
Food Facts name-search results use the same unit and nutrition handling.

## Custom meals

On web or mobile, choose **Add food → My meals → Create meal**. Search for or
scan each ingredient, enter its amount using its supported units, and name the meal. Gramello adds the ingredient calories, protein, carbs, and fat.

The ingredient weights provide an estimated batch weight. Meals containing
volume-based ingredients require a finished batch weight because liquid density
is not assumed. For more accurate
portions, enter the weight of the finished meal without its container; cooking
and added water change the weight. Choose a number of equal servings or a
portion weight in grams or ounces. A 64 oz batch with 1,200 kcal makes four
16 oz portions at 300 kcal each. Recipe portion ounces mean weight, and
portions assume the ingredients are evenly distributed.

Saved meals sync through your account. Reopen **My meals** to log any weight or
fractional serving, edit ingredients or yield, or delete a recipe. Edits and
deletions leave previously logged diary nutrition unchanged.

Existing installations need the `0002_custom_meals.sql` migration. Docker/Fly
apply migrations on startup; local databases need this migration applied with
the same Wrangler configuration and state directory used for the app.

## Restaurant menus and custom foods

Food search also includes imported restaurant menus for chains found within a
10-mile straight-line radius of the Census reference point for ZIP 29707. The
[coverage audit](docs/restaurant-import/coverage.md) distinguishes confirmed
locations, map candidates, and unresolved locations. The
[import summary](docs/restaurant-import/import-summary.json) lists the exact
catalogs and serving counts included in the migration; some chains do not
publish a usable full nutrition table.

Restaurant publications and nutrition database values show **Verified** in
search, portion selection, and the diary. This badge identifies the source;
it is not an independent laboratory measurement or a promise that a snapshot
matches every location's current menu. Source URLs and retrieval dates are
retained. Historical diary snapshots without validated catalog provenance stay
unverified. Logging a catalog food uses server-side nutrition and portion
calculations, so client-supplied values cannot forge a verified entry.

Choose **Add food → Add custom food** on web or mobile. Enter a name, a serving
description, and total calories, protein, carbs, and fat for that serving.
Serving weight is optional. The food becomes searchable by all signed-in users
and always shows **Unverified**. A custom food saves to the shared catalog
before you choose how much to add to your private diary; contributor identities
are not exposed in search. Calories are kept as entered, independently of the
macro totals.

Restaurant/custom foods can be logged by servings even when no weight is known.
Grams are offered only when a source provides a weight. Search retains local
catalog results during upstream outages and indicates when results are partial.

### Maintaining the imported catalog

Curated source snapshots live in `data/restaurant-foods/`, with provenance,
exclusions, source dates, location evidence, and extraction notes in
`docs/restaurant-import/`. The import generator rejects missing macros, invalid
numbers, duplicate IDs, missing serving labels, and missing HTTPS source URLs.
It preserves published numeric precision and never converts missing values to
zero. Source errors, incomplete rows, and ranges that cannot be represented
faithfully are documented instead of guessed.

`drizzle/0003_food_catalog.sql` preserves existing diary rows and adds the catalog.
`drizzle/0004_restaurant_catalog.sql` imports the reviewed snapshots. Both run
through the existing startup migration runner. Do not rewrite migrations that
have already been deployed: future refreshed imports need a new migration file.
During preparation, reconcile source reports with
`python3 scripts/restaurant-import/refresh-coverage.py`, then regenerate the
initial import with `node scripts/restaurant-catalog.mjs`. Extractors in `scripts/restaurant-import/`
are maintenance tools and do not run during app requests.

Run `SMOKE_BROWSER=1 pnpm test:smoke` after building to verify real migrations,
source verification, custom-food persistence, and the web flow in an isolated
local database. This does not modify the production diary.

## Public website and legal pages

The [Gramello website](https://gramello.com/) includes the
[privacy policy](https://gramello.com/privacy/),
[terms and conditions](https://gramello.com/terms/), and
[support and data requests](https://gramello.com/support/).
It is a separate static GitHub Pages site; the authenticated diary stays on Fly.io.
See [website development and publishing](website/README.md) for local preview,
content sources, and the automatic Pages deployment.

## Mobile app

The React Native app in [`mobile/`](mobile/README.md) uses Expo, gluestack-ui,
and the same Auth0 tenant and diary API. See its setup guide for native Auth0
registration, environment values, and iOS/Android run commands.

## Run with Docker Compose

Configure Auth0 using the steps below, then:

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). Diary data is stored in
the existing `nourish-data` volume and survives container restarts. Keep this
legacy volume name when updating an installation so it uses the same diary data.

## Fly.io deployment

The Gramello API and web app currently run at
[https://nourish-api.fly.dev](https://nourish-api.fly.dev). This hostname is a
live service address; changing the GitHub repository name does not move it.
`fly.toml` deploys the existing Docker image in `iad` with the SQLite database
and migration markers stored on the encrypted `nourish_data` volume at `/data`.
Daily volume snapshots are retained for 14 days. This is a single-Machine
deployment: do not scale horizontally without adding database replication,
because Fly volumes do not share data between Machines. Deploys and restarts
briefly interrupt service. Keep separate database exports for long-term backups.

The four web-authentication `AUTH0_*` settings are runtime Fly secrets.
`APP_BASE_URL` is set in `fly.toml`. The optional `AUTH0_AUDIENCE` and
`AUTH0_MOBILE_CLIENT_ID` bindings default to empty strings; set Fly secrets with
the configured API audience and Native Application client ID to enable mobile
authentication on the next deployment. The Auth0 web application must allow
`https://nourish-api.fly.dev/auth/callback` as a callback URL and
`https://nourish-api.fly.dev` as a logout URL.

To deploy changes from this checkout:

```bash
fly deploy --ha=false
fly status
fly checks list
```

Migrations run on the mounted volume before the HTTP server starts. Keep exactly
one Machine attached to the existing volume; do not delete the volume when
replacing the application container. To roll back application code, redeploy a
previous image with `fly deploy --ha=false --image <previous-image>`; this does
not reverse database migrations, so check schema compatibility first.

## Local development

Requires Node.js 22+ and pnpm.

```bash
corepack enable
pnpm install
pnpm run build
for migration in drizzle/*.sql; do
  pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --file "$migration"
done
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). The build creates the Wrangler
configuration used to initialize a new local database; run the migration loop
only once per database. `pnpm dev` loads `.env.local` at runtime.
To serve a production build locally instead, run
`pnpm start --env-file ../../.env.local --port 5173` (Wrangler resolves env files
relative to `dist/server/wrangler.json`).

## Auth0 setup

1. In the [Auth0 dashboard](https://manage.auth0.com/), create or select a
   **Regular Web Application**. Enable the login connections you want to offer
   through Universal Login, such as email/password or Google.
2. Add these **Allowed Callback URLs**:
   `http://localhost:5173/auth/callback, http://localhost:3000/auth/callback`.
   Add these **Allowed Logout URLs**:
   `http://localhost:5173, http://localhost:3000`.
3. Copy `.env.example` to `.env.local`. Set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and
   `AUTH0_CLIENT_SECRET` from the application's settings. Generate `AUTH0_SECRET`
   with `openssl rand -hex 32`. Keep this key stable across restarts and replicas;
   replacing it signs everyone out. Never commit `.env.local`.
4. Set `APP_BASE_URL=http://localhost:5173` for development. Docker Compose reads
   `.env.local` and overrides the base URL to `http://localhost:3000`. For a
   deployment behind an HTTPS reverse proxy, set `APP_BASE_URL=https://your-host`
   in the Compose environment and register that host's `/auth/callback` and root
   URL in Auth0. Use a single canonical origin, with no path or query string.

### Native API authentication

The iOS and Android app uses a separate Auth0 **Native Application** and the
same tenant and enabled connections as the web application. In Auth0:

1. Create an API for the Gramello server. Use a stable URL-style identifier such
   as `https://api.gramello.example` (it need not resolve on the public internet),
   select RS256 signing, and enable offline access for the API.
2. Create a Native Application. Enable Refresh Token Rotation with reuse
   detection, and enable the same database, social, or enterprise connections
   used by the Regular Web Application. Register the native callback and logout
   URLs documented in `mobile/README.md` for the `nourish` scheme.
3. Set server bindings `AUTH0_AUDIENCE` to the API identifier and
   `AUTH0_MOBILE_CLIENT_ID` to the Native Application client ID. The server uses
   these values to accept only access tokens issued for this API and native app.
4. Give the mobile app the Auth0 domain, Native Application client ID, API
   audience, and Gramello API base URL. Request `openid profile email
   offline_access`. These are public identifiers. Never put
   `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, or any other client secret in the app.

Both Auth0 applications must use the same tenant connections so the same person
receives the same Auth0 `sub` on web and mobile. Gramello uses that exact verified
subject as the database owner; changing tenants, connections, or account-linking
behavior can produce a different subject and therefore a separate diary.

The five web settings and two optional native API settings are server-side
bindings. The Docker image builds without credentials;
Compose supplies them at runtime. Do not prefix these variables with
`NEXT_PUBLIC_` or include them in build arguments. For a hosted Cloudflare Worker,
set the applicable values as runtime bindings. The generated Wrangler
configuration declares all seven names without embedding their values, so
Wrangler loads them from local environment files as well as runtime bindings.
For web-only use, leave `AUTH0_AUDIENCE` and `AUTH0_MOBILE_CLIENT_ID` empty in
the environment file (or define empty runtime bindings). Bearer requests then
receive `503` while cookie sessions continue to work.

The app uses the [official Auth0 Next.js SDK](https://auth0.github.io/nextjs-auth0/)
for authorization-code login, callback validation, encrypted HTTP-only cookies,
and logout. HTTPS enables secure cookies. Sessions expire after one day of
inactivity or seven days in total. The app does not expose access tokens to the
browser. APIs return JSON `401` when the session expires and `503` if sign-in
configuration is unavailable. Cookie-authenticated writes require an `Origin`
matching `APP_BASE_URL`. Native writes authenticate with the bearer token and do
not require a browser Origin header. Responses vary by both Cookie and
Authorization so caches cannot mix identities.

Each user's data belongs to their verified Auth0 `sub`. Incoming
`oai-authenticated-user-*` headers and client-supplied user IDs cannot select a
diary. Existing `site-owner` or ChatGPT data stays in the database, but is not
automatically assigned to an Auth0 user. To migrate it, back up the database,
verify the intended owner's Auth0 subject, and deliberately reassign that user's
rows in both `goals` and `entries`; resolve any existing goal row first.

## Water intake

The web and native diaries include a water card for the selected local date.
Quick-add 250/500/750 mL or 8/16/24 US fl oz, enter a custom amount, review entries,
and remove mistakes. **Edit water goal** saves a daily target and preferred unit
across devices. The initial target is an editable 2,000 mL; it is not a personalized
recommendation. Goals apply across the diary, including past dates.

Water is stored separately from food, calories and macros. Existing mobile clients
can continue saving nutrition goals without changing hydration settings. Volume is
stored in mL without rounding; US fl oz uses 29.5735295625 mL per fluid ounce.

Deploy `drizzle/0005_water_tracking.sql` before serving the updated backend.
Docker/Fly apply it through the existing startup migration runner. For other D1
installations, apply it to the intended database using the existing migration
procedure. This migration only creates `water_goals`, `water_entries`, and a
user/date index; it does not rewrite food or nutrition data. An updated native
build is required to display the water card on iOS/Android.

Authenticated endpoints:

- `GET /api/water?date=YYYY-MM-DD`: goal, entries and total for that date.
- `POST /api/water`: `{ "date": "YYYY-MM-DD", "amountMl": 250 }`.
- `DELETE /api/water?id=<entry-id>`: remove an entry belonging to the signed-in user.
- `PUT /api/water/goals`: `{ "goalMl": 2000, "unit": "ml" }` (`ml` or `fl-oz`).

## Verification

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
pnpm test:smoke
```

Tests exercise the real Auth0 cookie/session code and database queries with two
users, including anonymous requests, spoofed headers, expired cookies, CSRF, and
deletion ownership. The smoke check runs the built Worker with temporary
credentials and an isolated local database; it does not modify your diary or
contact Auth0. Complete a real login and logout with your configured tenant
before deploying.

## Releases

Commits use the [Conventional Commits](https://www.conventionalcommits.org/) format. Merges to `main` run semantic-release, generate release notes and the changelog, create a GitHub release, and publish multi-architecture Docker images to GitHub Container Registry:

```text
ghcr.io/<owner>/<repository>:latest
ghcr.io/<owner>/<repository>:<version>
```

Use `fix:` for patch releases, `feat:` for minor releases, and a `BREAKING CHANGE:` footer for major releases.

Stable releases also build the iOS app on Expo EAS and submit it to TestFlight.
The build uses the release tag's code and version; EAS increments the build number.
The repository's `EXPO_TOKEN` Actions secret authenticates the build robot.
See [mobile TestFlight setup](mobile/README.md#testflight) for credentials and manual reruns.

The iOS bundle identifier, Android package, Auth0 callback scheme and API
audience, Expo project slug, Fly hostname, and database volume names still use
their original internal IDs. They identify existing installs, sign-in flows, or
stored data; the public app and GitHub repository are Gramello.
