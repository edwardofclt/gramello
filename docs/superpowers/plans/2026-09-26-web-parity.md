# Web Parity Implementation Plan

**Goal:** Provide mobile-equivalent local data, offline food lookup and portable
backups in the existing web interface.

**Architecture:** Native repository and catalog logic execute in a SQLite WASM
worker. IndexedDB persists snapshots under cross-tab Web Locks. A web adapter
preserves the existing components' fetch-shaped contract.

**Spec:** [Web parity design](../specs/2026-09-26-web-parity-design.md)

## Global constraints

- Preserve all hosted data and native behavior.
- Use native archive validation, record bounds and nutrition math.
- New custom foods and diary writes stay in this browser.
- A successful UI write must mean a durable IndexedDB commit.
- Service worker caches static assets and the shell, never personal API data.

## Implementation

- [x] Build `lib/browser-local/` worker, SQLite adapter, IndexedDB persistence,
  catalog runtime and client RPC; test failed commits and cross-tab serialization.
- [x] Add `db/backup.ts` and `app/api/backup/route.ts`; test complete native archive
  round trips, empty diaries and browser ownership isolation.
- [x] Add build-time worker/WASM/catalog assets, offline service worker, and
  fixed-destination catalog relays; verify production build and offline reload.
- [x] Integrate local startup/migration and data Settings; test successful,
  failed and cancelled imports plus recovery and hosted migration retries.
- [x] Add removal confirmation and trend day inspector; test cancellation,
  busy dismissal, keyboard controls and range changes.
- [x] Run unit suite, typecheck, lint and actual browser flows at phone/desktop
  sizes. Update operating/privacy docs to match storage changes.

## Review focus

Concurrent tabs must preserve both writes. Quota failures must retain the prior
diary. Migration must not duplicate imports or overwrite local work. A failed
catalog update must preserve installed/bundled foods. Offline navigation and
reload must work without caching hosted personal responses.

## Verification results

Completed September 26, 2026. Siri remains an iOS-only integration, as requested.
The retained Expo browser client remains a compatibility client for the hosted API;
this implementation applies to the main web app.

- `pnpm test`: 369 tests passed across 38 files.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm lint`: no errors; three existing warnings remain.
- `pnpm exec eslint --no-ignore build/offline-vite-plugin.ts`: passed.
- `pnpm build`: production build passed.
- `pnpm exec playwright test --reporter=line`: 41 passed, one intentionally
  skipped desktop case for a mobile-only short-viewport interaction.
- Inspected desktop and phone Settings screenshots; neither viewport overflows
  horizontally.

The browser suite uses the production worker, SQLite WASM, IndexedDB, native
backup fixtures and a disposable hosted database. It covers actual offline
reload/search/logging, concurrent tabs, browser isolation, all-date migration,
import/export/recovery and the explicit-empty-import migration regression.
Changes are local and have not been deployed.
