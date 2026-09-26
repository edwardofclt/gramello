# Web parity with native Gramello

The user requested web/mobile parity and selected local browser storage. The
browser diary must work offline after its first successful load, use private
custom foods, and exchange complete `.gramello` backups with iOS and Android.
Existing hosted diaries must remain recoverable. Native Siri registration is an
iOS platform integration; the browser retains direct tracking controls.

## Architecture

Retain the existing responsive web UI. Run the native TypeScript repository,
food lookup, catalog reader, validation, and update logic in a browser worker
using SQLite WASM. Persist personal and provider-cache database snapshots in
IndexedDB. Serialize operations across tabs with Web Locks, reload the latest
snapshot before an operation, and acknowledge a write only after its IndexedDB
transaction commits. A failed write must not leak an unpersisted in-memory
state into subsequent reads. No diary writes go to the hosted API.

Ship the native catalog as a compressed static asset, preserving its food IDs,
servings and search ranking. Validate signed updates with the existing native
manifest/hash/schema checks; server routes relay the configured public catalog
without accepting arbitrary destination URLs. Bundled and cached foods remain
usable when providers or updates fail. Cache the application shell and static
assets with a service worker; never cache personal hosted API responses.

## Existing data

Add a cookie-scoped, read-only hosted archive endpoint exporting all dates,
recipes, owned custom foods, goals and water. Automatically bootstrap only an
empty, never-migrated local diary. Record migration atomically with its data.
Never replace existing local data or delete hosted rows. If automatic migration
cannot run, display a retry and retain manual hosted-backup download in Settings.
Explicit imports preview archive date/record count and confirm replacement,
retaining the prior diary for recovery using the native repository semantics.

## Interface

Add Settings with offline/catalog status, backup download, native-compatible
import, diary/water CSV exports, recovery, and hosted-data recovery. State that
data belongs to this browser and clearing site data removes it. Match mobile's
food-removal confirmation and add keyboard/touch trend-day inspection. Keep
existing food, meal, nutrition and water controls usable at phone and desktop
sizes. Surface initialization/storage errors instead of opening an empty diary.

## Verification

Exercise repository durability, cross-tab writes, failed persistence, complete
backup round trips, replacement recovery, migration isolation and all-date
exports. Run browser tests against the actual worker/WASM/IndexedDB, including
offline reload, private custom foods, full native backup import, and food
logging from the bundled catalog. Preserve existing nutrition/API unit checks,
run type/lint/build checks, and inspect phone and desktop UI.
