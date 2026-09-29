# US branded catalogs implementation plan

> Use superpowers:executing-plans inline; one independent review at the end.

**Goal:** Import both US-market datasets into SQLite and automatically install their signed packs.
**Architecture:** Independent source databases reuse the v1 SQLite format; a v2 signed pack manifest coordinates resumable updates. Compose pack readers with the existing core and cache.
**Tech Stack:** TypeScript, Node 24 SQLite, Python streaming extraction, Expo SQLite, SQLite WASM, IndexedDB, Ed25519.
**Spec:** `docs/superpowers/specs/2026-09-29-us-branded-catalogs-design.md`

## Global constraints

US-market products only. Automatic download including cellular. Maximum 32 MiB
per expansion pack. Keep existing core and diary untouched. OFF databases remain
separate. Never fill missing macros with zero. Preserve existing trust key.

## Review focus

Corrupt or truncated downloads must not replace good data. Partial sets must resume.
Source disagreement must not mutate diary snapshots. Liquids must retain mL units.
Unconfigured release assets must leave existing search and diary usable. Browser
readers must close databases after errors and never hold all packs in memory.

### Task 1: Import contract and source-specific SQLite build

Files: `lib/catalog-import.ts`, `scripts/food-packs.mjs`,
`scripts/extract-food-packs.py`, `tests/branded-catalog.test.ts` and fixture JSON.
Interfaces: `normalizeUsdaBranded`, `normalizeOffProduct` return validated Food with
barcodes or null; builder consumes streaming raw JSONL and writes source-only packs.

- [x] Write fixtures and tests for US filtering, missing/invalid macros, liquids,
  canonical GTINs, exact Al Fresco serving nutrition and SQLite source separation.
- [x] Run `pnpm test tests/branded-catalog.test.ts`; expect missing importer failure.
- [x] Implement normalizers, streaming official dataset extraction and bounded builds.
- [x] Re-run tests; expect all assertions passing. Preserve generated data outside git.

### Task 2: Signed pack updates and bounded source reader

Files: `mobile/src/catalog/packs.ts`, `pack-reader.ts`, `updater.ts`, `lookup.ts`,
`queries.ts`, `tests/catalog-packs.test.ts`, `tests/local-food-lookup.test.ts`.
Interfaces: pack storage load/save/fetchManifest/install/retire; updater remains
compatible with CatalogUpdater. Pack reader composes installed packs and core.

- [x] Write signature, metadata-boundary, checkpoint/restart, unchanged-pack,
  failure/backoff, retirement, source precedence and real-reader tests.
- [x] Run targeted tests; expect new contract failures.
- [x] Implement verification, sequential partial progress, composed updater,
  bounded readers and USDA-before-cached-OFF barcode resolution.
- [x] Re-run targeted tests; expect success without changing fresh-OFF semantics.

### Task 3: Browser/native activation and publication tooling

Files: native runtime, browser worker, relay routes, catalog config,
`.github/workflows/branded-food-packs.yml`, source documentation and relay tests.
Consumes Task 2's storage and reader interfaces; provides automatic updater on
existing launch/foreground triggers and signed-only download URLs.

- [x] Write relay tests for unknown pack, wrong hash and verified manifest downloads.
- [x] Run relay tests; expect new-route failures.
- [x] Wire transactional browser activation and native hash/file activation, then
  add reproducible extraction/publication workflow and source/license documentation.
- [x] Run targeted tests, full `pnpm test`, lint, web/mobile type checks and build.
- [x] Build local Al Fresco packs, query them offline and request independent review.
  Record publication requirements without publishing or replacing the trust key.
