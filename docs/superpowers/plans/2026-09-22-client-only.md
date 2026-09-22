# Client-only mobile implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship an account-free native diary with local SQLite, silent catalog releases, and user-directed export/import.

**Architecture:** The native entry point uses a local session/data provider; the browser edition retains its hosted provider. Typed repository methods persist personal records separately from a replaceable indexed catalog. A compatibility adapter lets existing screens keep their data contract while all native operations run locally.

**Tech stack:** Expo 57, expo-sqlite, expo-file-system, expo-sharing, expo-document-picker, Zod, signed GitHub Release manifests, Node SQLite catalog builder, Vitest.

**Spec:** `docs/client-only-scope.md`, as corrected and approved in this conversation.

## Global constraints

- One active device; moving data is manual export/import. No personal-data uploads or provider sign-in.
- Catalog download/check/install is automatic; Settings has an immediate check action.
- Preserve historical nutrition and recipe ingredient snapshots.
- Keep hosted web working during migration. Native startup cannot depend on hosted-service configuration.
- Only USDA/public-domain data enters the distributable starter catalog; existing restaurant imports stay with the hosted edition pending rights review.

## Review focus

- An import interrupted or rejected after validation must preserve the original diary.
- An update must never replace personal data or activate an incomplete/untrusted catalog.
- Portability includes recipes, water goals, dates, source information, and serving units, not just calorie totals.
- Concurrent UI operations must not enter another operation's SQLite transaction.
- An absent release, offline device, or purged catalog cache must still provide a usable diary.

## Files and interfaces

- `mobile/src/local/database.ts`: small SQLite connection contract and serialized transaction execution.
- `mobile/src/local/records.ts`: versioned schemas for personal records and archive validation.
- `mobile/src/local/repository.ts`: personal repository; `getDay`, `saveGoals`, `addEntry`, `removeEntry`, `getTrends`, food/meal/water methods, `exportArchive`, `importArchive`, `restorePrevious`.
- `mobile/src/local/api.ts`: dispatch the existing `ApiClient` contract locally, without HTTP.
- `mobile/src/catalog/format.ts`: food-pack and signed-manifest formats, compatible-version checks.
- `mobile/src/catalog/updater.ts`: single-flight update state machine with injected storage/network and signature verification.
- `mobile/src/local/native.ts`: Expo SQLite/filesystem wiring, catalog installation and lookup, archive file I/O.
- `mobile/src/diary/Session.native.tsx`, `mobile/App.native.tsx`: native startup and local provider.
- `mobile/src/components/LocalDataSettings.tsx`: update status, archive/CSV export, import confirmation and recovery.
- `scripts/food-catalog.mjs`, `scripts/import-usda.py`: deterministic approved data conversion, SQLite generation and signing.
- `.github/workflows/food-catalog.yml`: validate/build/publish catalog assets independently of binaries.

## Task 1: Personal SQLite and portable format

- [x] Add real Node SQLite test adapter and failing tests for persistence, portion snapshots, water, recipes, transactional replacement, validation and recovery.
- [x] Run `pnpm exec vitest run tests/local-storage.test.ts`; verify feature-missing failures.
- [x] Implement the connection contract and personal repository with bound SQL, serialized operations, transactional migration and restore.
- [x] Verify round-trip preservation across fresh databases and rejection of future/corrupt archives.

Archive boundary:
```ts
export type Archive = { format: 'gramello'; version: 1; exportedAt: string; records: PersonalRecord[] };
export type PersonalRecord = { kind: 'entry' | 'food' | 'meal' | 'goals' | 'water' | 'waterGoal'; id: string; date: string | null; value: unknown };
```
All `value` objects are validated by kind; duplicate record keys and inconsistent ID/date fields are rejected before a live transaction.

## Task 2: Catalogs and safe updating

- [x] Add failing tests for signature failure and staged-database validation, interrupted install, incompatible schema, single-flight checks, check intervals and retry.
- [x] Implement signed manifest verification and the updater, keeping the last working catalog active until complete validation.
- [x] Build a USDA-derived starter with FTS and barcode indexes; source attribution travels with the asset.
- [x] Test the builder against valid records, missing nutrient values, duplicate IDs and unapproved sources using a real SQLite output.

Update boundary:
```ts
checkForUpdates(force?: boolean): Promise<void>
```
Network/filesystem adapters stage and inspect a pack before activation; failure changes Settings status without rejecting native application startup.

## Task 3: Native wiring and settings

- [x] Test the local API dispatch through the real repository for every screen route.
- [x] Install SDK-compatible native dependencies and wire `App.native.tsx` plus `Session.native.tsx`.
- [x] Add Settings actions and import preview/confirmation; create a recovery snapshot before replacement.
- [x] Reuse hosted UI with local-specific copy; preserve browser behavior.
- [x] Run mobile typecheck and native JS exports to catch missing modules and platform resolution errors.

## Task 4: Publishing, existing users and release configuration

- [x] Defer hosted migration/export: user explicitly excluded all browser work during implementation.
- [x] Add a reusable catalog publishing workflow and document signing-key/configuration setup.
- [x] Remove hosted-service configuration from native store profiles; retain store AAB production builds.
- [x] Update README/setup, catalog sources and portability format documentation.

## Task 5: Verification and review

- [x] Run the full Vitest suite, root/mobile TypeScript, ESLint and native export.
- [x] Stop browser UI validation and discard browser-test edits: outside the user’s revised scope.
- [x] Obtain a fresh whole-change review; fix important findings and rerun affected checks.
- [x] Report physical-device/store-publishing steps that cannot be verified locally, without claiming they passed.

## Execution result

Implementation, native bundle exports, shared automated tests and fresh review
are complete. Review found and fixed the oversize archive/recovery issue; details
and final commands are recorded in `docs/client-only-validation.md`. No browser
feature work is included. Android native compilation, physical-device validation,
public catalog publication and store submission remain release operations.
