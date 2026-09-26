# Gramello

A calorie, macro, and water tracker with a daily diary, serving and weight
controls, custom foods and meals, editable goals, and 7-day, 30-day, and
6-month trends.

Click or tap a logged food to edit its amount, measure, or meal, then choose
**Save changes**. Totals update using the nutrition saved with that entry,
even if its original food or recipe has since changed or been removed.

The native iOS/Android app works offline with personal data stored on the device
and no account. The self-hostable web app and Expo browser client also open
the diary directly, without login. They use separate data stores:

| Behavior | Native iOS/Android | Hosted web and Expo browser |
| --- | --- | --- |
| Sign-in | None | None |
| Diary, meals, and goals | Local SQLite on each device | Server database, scoped to an anonymous browser cookie |
| Food search | Offline USDA and restaurant catalogs, cached lookups, private custom foods; automatic Open Food Facts searches and missing-barcode lookups | Live USDA/Open Food Facts, imported restaurant menus, and shared custom foods |
| Moving data | User-directed backup export/import | A separate diary for each browser cookie |

Native data does not sync with the hosted diary or other devices. Clearing the
browser cookie loses access to that browser's hosted diary. Existing records from
older account-based versions remain untouched and are not exposed to anonymous
browsers; no account migration is performed.

The source repository is [edwardofclt/gramello](https://github.com/edwardofclt/gramello).
For product help and data requests, see [support](docs/support.md) and the
[privacy policy](docs/privacy.md). App Store preparation is tracked in
[the release checklist](docs/app-store-preparation.md).

## Native app

The [React Native app](mobile/README.md) uses Expo and gluestack-ui. From the
repository root, use Node.js 24 and the pinned pnpm 11.25.0:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm mobile:ios
# Or, with an Android emulator/device and Android SDK:
pnpm mobile:android
```

iOS requires macOS, Xcode, and CocoaPods. Android requires Android Studio/SDK
and a compatible JDK. These commands build a development app; use that instead
of Expo Go. Later, run `pnpm mobile` to start Metro for the installed build.
Rebuild after changing native dependencies. Native builds require no account
configuration or running API. See the [mobile guide](mobile/README.md) for
physical-device setup and the retained Expo browser client.

### Local data and backups

Diary entries, recipes, custom foods, water history, and goals live in the
device's `gramello-personal.sqlite` database. In **Settings → Advanced → Your data**:

- **Export backup** saves a complete `.gramello` archive through the OS share/save interface.
- **Export diary CSV** and **Export water CSV** create spreadsheet exports. CSV cannot restore the complete diary.
- **Import backup** previews a `.gramello` archive and requires confirmation to replace the device's personal data. Imports do not merge diaries.
- **Recover previous diary** restores the recovery copy retained before replacement.

Backups work between native iOS and Android installations and are readable by
anyone with access to the file. Portable backups are limited to 32 MiB and
200,000 records. Catalog databases are separate from personal data and are not
included in backups. Gramello has no automatic personal-data cloud sync; choose
where to save exports using the device's sharing options.

### Offline food catalog

The app bundles [50,322 foods](data/food-catalog/README.md): 7,793 USDA SR Legacy
foods and all 42,529 previously imported restaurant foods across 150 catalogs.
Name search works on first launch without a network connection. Barcode lookup
checks installed and cached foods first, then queries Open Food Facts directly
for missing codes and saves successful matches for offline use. Typing a name
searches on-device foods and automatically includes Open Food Facts matches,
which are cached for offline use. If an online database is unavailable, available
foods remain usable; tap the warning to see the affected source and failure details.
Unknown products offer name search or custom entry.

The app checks for signed catalog updates at launch and when returning to the
foreground. Successful checks defer the next automatic check by 24–25 hours;
**Settings → Advanced → Food catalog → Check for updates** checks immediately. Updates
validate the signature, download hash, and SQLite contents before activation.
Installed foods remain usable during an outage, and an invalid or purged cache
falls back to the bundled catalog. Bundled foods also remain available beneath
older downloaded catalogs, so a narrower update cannot hide the restaurants.

Downloadable updates require the `CATALOG_SIGNING_KEY` repository secret and a
published signed manifest. Without the secret, the **Publish food catalog**
workflow skips publication; the bundled catalog still works. See
[catalog signing, publishing, and recovery](docs/client-only-implementation.md)
for setup and release checks.

### Anonymous usage analytics

Native analytics uses Segment when `EXPO_PUBLIC_SEGMENT_WRITE_KEY` is set.
The production EAS profiles configure a public write key. Events use a random
installation ID and fixed action/screen names; the allowlist excludes diary
contents, search terms, barcodes, nutrition values, and account identities.
Leaving the key blank disables analytics in a build. See
[analytics configuration and event details](mobile/README.md#anonymous-usage-analytics).

## Hosted food search

The web app and hosted Expo browser client combine:

- [USDA FoodData Central](https://fdc.nal.usda.gov/) for generic and branded foods
- [Open Food Facts](https://world.openfoodfacts.org/) for its open, community-maintained product database and images
- A small built-in USDA reference fallback for common staples
- Imported restaurant menus and user-created foods in the server catalog

The live USDA request currently uses `DEMO_KEY` in `lib/food-providers.ts`;
there is no configurable USDA API-key setting. Provider failures are reported
as partial results while matching server-catalog foods remain available.

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

Native meals stay on the device and are included in backups. Hosted meals are
saved to the current browser's diary. Reopen **My meals** to log any weight or
fractional serving, edit ingredients or yield, or delete a recipe. Edits and
deletions leave previously logged diary nutrition unchanged.

Existing hosted installations need the `0002_custom_meals.sql` migration.
Docker containers apply migrations on startup; local hosted databases need this
migration applied with the same Wrangler configuration and state directory
used for the app. Native SQLite initializes its own schema.

## Restaurant menus and custom foods

Hosted food search includes imported restaurant menus for chains found within a
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
Serving weight is optional. Native custom foods are private to the device and
appear as **My foods**. Hosted custom foods save to the shared server catalog
and become searchable by all hosted browsers; contributor identities are not
exposed in search. Both show **Unverified** and save before you choose how much
to log. Calories are kept as entered, independently of the macro totals.

Restaurant/custom foods can be logged by servings even when no weight is known.
Grams are offered only when a source provides a weight. Hosted search retains
server-catalog results during upstream outages and indicates when results are partial.

### Maintaining the hosted restaurant catalog

These imports populate the hosted database and the native offline catalog.
Native catalog builds use the exact catalogs listed in the import summary,
preserve their source information, and record mixed provenance rather than
labeling restaurant data as USDA CC0.

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
It is a static GitHub Pages site, separate from the self-hostable diary.
See [website development and publishing](website/README.md) for local preview,
content sources, and the automatic Pages deployment.

## Run the hosted web app with Docker Compose

The web app uses React, Next.js-compatible routes through Vite/vinext, and
Drizzle with a Cloudflare D1 binding. Docker runs the built Worker through
Wrangler with a persistent local SQLite database.

Start the web app:

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). Diary data is stored in
the existing `nourish-data` volume and survives container restarts. Keep this
legacy volume name when updating an installation so it uses the same diary data.

## Hosted web development

Use Node.js 24, matching CI, and pnpm 11.25.0. The root package declares a
minimum Node.js version of 22.13.0. The diary opens without an account.

```bash
corepack enable
pnpm install --frozen-lockfile
if [ ! -f .env.local ]; then cp .env.example .env.local; fi
# APP_BASE_URL defaults to the local browser origin in .env.example.
pnpm run build
for migration in drizzle/*.sql; do
  pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file "$migration"
done
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). The build creates the Wrangler
configuration used to initialize a new local database; run the full migration
loop only once per database. For an existing database, apply only unapplied
SQL files using the same configuration and `.wrangler/state` directory.
`pnpm dev` loads `.env.local` at runtime.
To serve a production build locally instead, run
`pnpm start --env-file ../../.env.local --port 5173` (Wrangler resolves env files
relative to `dist/server/wrangler.json`).

## Hosted browser data and configuration

Set `APP_BASE_URL` to the single canonical browser origin, without a path or query
string. The example uses `http://localhost:5173`; Docker Compose defaults to
`http://localhost:3000`. For an HTTPS reverse proxy, set
`APP_BASE_URL=https://your-host` in the Compose environment. This is a server
runtime value and does not require a build-time secret.

The web and Expo browser apps open the diary automatically. A random, HttpOnly
`gramello_diary` cookie selects that browser's records in the server database.
The cookie uses `SameSite=Lax` and is secure on HTTPS. Each browser with a new
cookie gets a separate diary. Clearing cookies or using another browser loses
access to the original diary; there is no account recovery or cross-device sync.
Clearing the cookie does not delete the stored server records.

Keep the browser client and `/api` on the same origin. Writes require an `Origin`
matching `APP_BASE_URL`; the API does not support cross-origin browser clients.
For a separately built Expo browser UI, place it behind a reverse proxy that
serves its API requests on that same origin. See
[hosted browser setup](mobile/README.md#hosted-browser-setup).

The browser cookie cannot select records from older account-based versions.
Those records remain untouched in the database and are not migrated or exposed
to anonymous diaries. Native iOS/Android data remains in local SQLite and does
not use this cookie or the hosted API.

## Water intake

The web and native diaries include a water card for the selected local date.
Quick-add 250/500/750 mL or 8/16/24 US fl oz, enter a custom amount, review entries,
and remove mistakes. On native, **Settings** holds calorie, macro, and water
goals, including the preferred water unit; water logging stays in the diary.
On web, **Edit water goal** opens the water target and unit controls. Goals save
on the native device or in the current browser's hosted diary. The initial water
target is an editable 2,000 mL; it is not a personalized recommendation. Goals apply across
the diary, including past dates.

Water is stored separately from food, calories and macros. Existing mobile clients
can continue saving nutrition goals without changing hydration settings. Volume is
stored in mL without rounding; US fl oz uses 29.5735295625 mL per fluid ounce.

Hosted installations need `drizzle/0005_water_tracking.sql` before serving the backend.
Docker containers apply it through the existing startup migration runner. For other D1
installations, apply it to the intended database using the existing migration
procedure. This migration only creates `water_goals`, `water_entries`, and a
user/date index; it does not rewrite food or nutrition data. Native water data
uses the local SQLite repository and does not require server migrations.

Hosted endpoints scoped to the current browser diary:

- `GET /api/water?date=YYYY-MM-DD`: goal, entries and total for that date.
- `POST /api/water`: `{ "date": "YYYY-MM-DD", "amountMl": 250 }`.
- `DELETE /api/water?id=<entry-id>`: remove an entry belonging to the current browser diary.
- `PUT /api/water/goals`: `{ "goalMl": 2000, "unit": "ml" }` (`ml` or `fl-oz`).

## Verification

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm --filter @gramello/mobile typecheck
pnpm lint
pnpm --filter @gramello/mobile export
pnpm build
pnpm test:smoke
```

Tests cover native SQLite persistence, backups/import/recovery, signed catalog
updates, nutrition calculations, and the hosted browser/database paths, including
cookie creation, diary isolation, same-origin writes, and deletion ownership.
The smoke check runs the built Worker with an isolated local database; it does
not modify your diary.

For browser interaction checks, install Chromium with
`pnpm exec playwright install chromium`, then run `pnpm test:e2e` after building
and `pnpm test:mobile:ui` for the Expo browser screens. See the
[web test guide](tests/e2e/README.md) and [mobile verification guide](mobile/README.md#verify).
Native JS exports and browser tests do not replace device checks for scanning,
restart persistence, file sharing/import/recovery, or interrupted catalog downloads.

## Releases

Commits use the [Conventional Commits](https://www.conventionalcommits.org/) format.
Pushes to `main` run semantic-release. When releasable changes exist, it updates
the changelog and creates a GitHub release. A follow-up job publishes the website
from that release tag only when the website, policies, or publishing workflows
have changed since the previous stable version. Website changes on `main` wait
for a stable release instead of deploying separately on push.

Use `fix:` for patch releases, `feat:` for minor releases, and a `BREAKING CHANGE:` footer for major releases.

Stable releases also use Expo EAS to build and submit iOS to TestFlight and
build a signed Android AAB. Android upload/submission to Google Play remains a
separate release task; TestFlight submission does not publish an App Store release.
The builds use the release tag's code and version, with EAS incrementing build
numbers. The repository's `EXPO_TOKEN` Actions secret authenticates the jobs.
Stable releases also build a signed APK and attach `gramello-<release-tag>.apk`
to the GitHub release for direct installation on Android. The APK workflow can
be rerun manually for an existing stable release. See
[store builds and release APKs](mobile/README.md#store-builds-and-release-apks)
for signing credentials and reruns.

Catalog publication is independent: **Publish food catalog** runs manually or
on approved catalog-input changes on `main`, publishing to the `food-catalog`
prerelease when signing is configured. It does not trigger native app releases.
The release workflow does not deploy the self-hosted web app.

The iOS bundle identifier, Android package, app scheme, Expo project slug,
and database volume names still use their original internal IDs. They
identify existing installs or stored data; the public app and GitHub repository
are Gramello.
