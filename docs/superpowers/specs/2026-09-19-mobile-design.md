# Gramello mobile design

The Expo, React Native, TypeScript, and gluestack-ui app shares diary screens
across iOS, Android, and the browser. The original hosted companion design has
been superseded by [native local storage](../../client-only-implementation.md)
and anonymous browser diaries.

## Data access

Every platform opens the diary without login. Native iOS and Android use an
in-process SQLite repository; no hosted API or account configuration is required.
Diary entries, water, meals, custom foods, and goals remain on the device. Moving
a native diary between installations requires a user-directed backup export/import.

The Expo browser client uses the hosted API on the browser's own origin. A random
HttpOnly `gramello_diary` cookie selects an independent hosted diary, and writes
require the configured browser origin. Clearing the cookie loses access to that
diary without deleting its server records. Existing records from older
account-based versions remain untouched and are not exposed to anonymous diaries.
Native and hosted diaries do not sync.

## Screens and behavior

- Diary with local calendar dates, previous/next day, calorie ring, macro progress,
  four meal sections, pull-to-refresh, and entry removal with confirmation.
- Add-food sheet with debounced search, serving/gram quantities, meal choice,
  scaled nutrition preview, and persisted additions.
- Trends with 7-day, 30-day, and 6-month ranges, calorie chart, logged-day averages,
  macro summaries, and honest empty/error/loading states.
- Goals with the web app's calorie/macro coupling and persisted settings.
- Native Settings with catalog update status, backup export/import, CSV export,
  and recovery after diary replacement.

Dark navy surfaces, mint accents, blue carbs, amber fat, generous touch targets,
safe areas, accessible labels, keyboard handling, and a persistent bottom bar.
No fabricated diary data or false save confirmations. Prevent stale loads and
duplicate writes.

## Verification

Exercise browser diary isolation and same-origin writes, plus native SQLite
persistence and backup recovery. Test request handling, local calendar math,
and nutrition scaling. Run web/mobile type checks, lint, tests, web build,
Expo configuration validation, and iOS/Android JS bundle exports. Document
physical-device verification separately from browser and bundle checks.
