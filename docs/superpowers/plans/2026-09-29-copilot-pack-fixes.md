# Nutrition Pack Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Resolve the eleven actionable Copilot findings without altering personal data, source nutrition, or publication authority.

**Architecture:** Share bounded-response and verification helpers across platforms. Native retains content-addressed files; browser expansion packs migrate to regular SQLite OPFS with durable IndexedDB activation pointers and a compatibility fallback. Derive USDA routes locally from verified databases, keyed by installed hashes.

**Tech Stack:** TypeScript, SQLite and FTS5, Expo fetch and file system, SQLite WASM 3.53.4-build1, IndexedDB, Vitest, Playwright, Node 24, Python extraction fixtures.

**Spec:** [Approved design](../specs/2026-09-29-copilot-pack-fixes-design.md), approved by the user's “Ship it” reply on 2026-09-29. That approval precedes this implementation plan; the plan still requires its own review and execution-method selection.

## Global Constraints

- “Personal diaries, custom foods, provider cache, bundled catalog, and core catalog updates retain their existing storage and behavior.”
- “Do not change the dependency version as part of these fixes.” Retain the current trust key, signed pack schema versions, US filtering, source separation, and USDA barcode precedence.
- “Open at most one expansion database at a time”; retain the existing update and reader lock names and bounded ranked candidates.
- “The manifest envelope cap is 520,000 bytes.” “Packs retain the signed exact length and 32 MiB maximum.” Cellular downloads and existing timeouts remain enabled.
- “Do not publish a release, access a private signing key, or change the app trust key while implementing these fixes.” Preserve the original worktree and running simulator diary.

## Review Focus

- A multibyte response crosses the byte cap while its character count remains small: reject and cancel before buffering the rest. Task 1.
- A download expires or its sink fails after accepted chunks: close the handle, remove only the temporary file, and retain old activation. Tasks 1 and 2.
- A publisher changes the manifest twice during one check: stop after one immediate refresh and persist normal retry state. Task 3.
- A tab sees an old descriptor during migration or repartition: do not read another hash's bytes or delete files referenced by the current index. Tasks 6 and 7.
- Isolation disappears after migration: use asynchronous OPFS fallback if available, otherwise report expansion unavailability without deleting files or breaking diaries. Task 7.

## Execution and verification rules

Work only in `/Users/eherbert/.codex/worktrees/copilot-review-fixes/nourish`, branch
`codex/copilot-review-fixes`. Do not create a second worktree. The baseline was
631 passing tests before this plan; rerun verification after implementation.
For each task, write its regressions, run them against unchanged implementation,
record the expected failures, implement the minimal behavior, rerun, then commit.
Do not write a test that merely matches source text or workflow YAML.

The current test helpers `storage()` and `envelope()` in
`tests/catalog-packs.test.ts`, `setup()` in `tests/browser-packs.test.ts`, and
`testDatabase()` in `tests/helpers/local-sqlite.ts` are existing fixtures to
extend. Use the real normalized Al Fresco fixtures and SQLite queries. Native
platform doubles must implement the pinned Expo file APIs and use disposable
real files/SQLite behind them; do not mock the storage logic being tested.

## Task 1 Bounded response streams

**Files:** Create `mobile/src/catalog/downloads.ts` and `tests/pack-downloads.test.ts`. Modify `lib/catalog-pack-relay.ts`, `lib/browser-local/packs.ts`, and `mobile/src/catalog/native-packs.ts` manifest fetches. Extend `tests/catalog-pack-relay.test.ts` and `tests/browser-packs.test.ts`.

**Interfaces:** Export the following shared helpers. The sink receives a chunk only after its size passes the bound. Both standard browser and Expo responses satisfy the consumed response shape.

```ts
type DownloadResponse = Pick<Response, 'ok' | 'body'>;
type DownloadBounds = { maxBytes: number; exactBytes?: number };
export async function consumeBoundedResponse(
  response: DownloadResponse, bounds: DownloadBounds,
  write: (chunk: Uint8Array<ArrayBuffer>) => void | Promise<void>,
): Promise<number>;
export async function readPackManifestResponse(response: DownloadResponse): Promise<unknown>;
export async function readPackResponse(response: DownloadResponse, expectedBytes: number): Promise<Uint8Array<ArrayBuffer>>;
```

- [ ] **Write failing regressions.** Use literal byte limits and real response streams. Prove an overflowing chunk is not delivered to the sink, a truncated response fails, cancellation runs, and multibyte UTF-8 counts bytes. Add one manifest test through each real fetch consumer; native coverage completes in Task 2.

```ts
it('does not write an overflowing chunk', async () => {
  let cancelled = false;
  const written: number[] = [];
  const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(c) { c.enqueue(new Uint8Array(4096)); c.enqueue(new Uint8Array(1)); },
    cancel() { cancelled = true; },
  });
  await expect(consumeBoundedResponse(new Response(body),
    { maxBytes: 4096, exactBytes: 4096 }, chunk => { written.push(chunk.length); }
  )).rejects.toThrow(/size|large|exceed/i);
  expect(written).toEqual([4096]);
  expect(cancelled).toBe(true);
});
```

- [ ] **Run RED.** First run `pnpm test tests/catalog-pack-relay.test.ts tests/browser-packs.test.ts` with overflow/cancellation regressions through their existing manifest fetch consumers. Observe behavioral failures caused by complete buffering before creating the new helper module; a missing-module error alone is not red evidence. Then add the helper unit tests and include a sink that throws and an errored stream.
- [ ] **Implement the bound before the write.** Validate positive integer limits, require a successful streaming body, cancel on failures, and release locks in `finally`. Accumulate manifest chunks only within 520,000 bytes; decode and JSON-parse after completion. `readPackResponse` retains the 4096-byte minimum and 32 MiB maximum. Preserve `readPackDownload` as a forwarding export if current callers need it. Switch the native manifest fetch to `expo/fetch` in this task so the new shared reader is not temporarily paired with a non-streaming native fetch implementation.

```ts
const reader = response.body!.getReader();
let size = 0;
try {
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    if (size + next.value.byteLength > bounds.maxBytes) throw new Error('Download exceeds its signed size.');
    size += next.value.byteLength;
    await write(next.value);
  }
  if (bounds.exactBytes !== undefined && size !== bounds.exactBytes) throw new Error('Download is incomplete.');
  return size;
} catch (error) {
  await reader.cancel().catch(() => {});
  throw error;
} finally { reader.releaseLock(); }
```

- [ ] **Run GREEN.** Repeat the targeted command, then `pnpm exec tsc --noEmit` and `pnpm --filter @gramello/mobile exec tsc --noEmit`. Do not use `response.text()` before bounding any expansion manifest.
- [ ] **Commit.** Stage only Task 1's implementation and tests; commit `fix: bound nutrition pack response streams`.

## Task 2 Native repair and verification reuse

**Files:** Create `mobile/src/catalog/pack-verification.ts` and `tests/native-packs.test.ts`. Modify `mobile/src/catalog/native-packs.ts`. Create `tests/helpers/native-pack-platform.ts` for test-only Expo adapters backed by disposable real files and SQLite.

**Interfaces:** Task 1 supplies `consumeBoundedResponse` and `readPackManifestResponse`. Export a metadata-only verification cache; it never retains file bytes.

```ts
import type { FoodPack } from './packs';
export type PackFileStamp = { bytes: number; modifiedAt: number | null };
export function createPackVerification() {
  const accepted = new Map<string, string>();
  return {
    async verify(pack: FoodPack, stamp: PackFileStamp,
      digest: () => Promise<string>, force = false): Promise<boolean> {
      const cacheable = Number.isFinite(stamp.modifiedAt) && (stamp.modifiedAt ?? 0) > 0;
      const token = `${pack.bytes}:${stamp.bytes}:${stamp.modifiedAt}`;
      if (stamp.bytes !== pack.bytes) { accepted.delete(pack.sha256); return false; }
      if (!force && cacheable && accepted.get(pack.sha256) === token) return true;
      if (await digest() !== pack.sha256) { accepted.delete(pack.sha256); return false; }
      if (cacheable) accepted.set(pack.sha256, token);
      return true;
    },
    invalidate(hash: string) { accepted.delete(hash); },
  };
}
```

- [ ] **Write failing regressions.** Corrupt a real installed pack, invoke `install` once, and assert its food becomes readable without a second check. Exercise native manifest overflow and transfer overflow through the real storage adapter. Read an unchanged file twice and assert complete-file verification reads occur once; mutate same-sized bytes and modification metadata, then assert the reader rejects. Missing metadata and forced availability must rehash. Failed storage metadata commits must preserve the previous activation.
- [ ] **Run RED.** `pnpm test tests/native-packs.test.ts`. Keep hashing real using Node crypto in the platform adapter. Mock only Expo module entry points and network, not `install`, `available`, or `withReader`.
- [ ] **Implement.** Import streaming `fetch` from `expo/fetch`. Under the reader queue, force-verify an existing destination; remove it only if corrupt and invalidate its verification token. Download outside the queue into `pack-<hash>-<unique>.partial`, creating and closing an Expo file handle around the bounded sink. Hash/inspect the temporary file, move it into place under the queue, and activate only after metadata persistence succeeds. Remove partials on failure, not previous versions. Use the verification cache on reader opens and force verification for repair availability.

```ts
const handle = temporary.open();
try {
  await consumeBoundedResponse(response,
    { maxBytes: pack.bytes, exactBytes: pack.bytes }, chunk => handle.writeBytes(chunk));
} finally { handle.close(); }
```

Stage inspection and movement must finish before descriptor save. Never save personal metadata while holding the catalog queue. Pass `file.lastModified` as the native stamp; zero or absent timestamps require explicit handling rather than indefinite trust. Prune cache entries when files retire.

- [ ] **Run GREEN.** Repeat native tests and both type checks. Confirm reader connections close on every error and accepted writes never exceed the signed size.
- [ ] **Commit.** `fix: repair native nutrition packs safely` with only this task's files.

## Task 3 Manifest transitions and visible retry state

**Files:** Modify `mobile/src/catalog/packs.ts`, `mobile/src/catalog/updater.ts`, and `lib/browser-local/packs.ts`. Extend `tests/catalog-packs.test.ts`, `tests/browser-packs.test.ts`, and settings tests where status is displayed.

**Interfaces:** Export `PackManifestChangedError` from `packs.ts`. Add optional `error`, `completedPacks`, `totalPacks`, `downloadedBytes`, and `totalBytes` fields to `UpdateState`, preserving existing core-updater compatibility. Browser storage throws the distinct error for 409; the relay still verifies the latest signed manifest.

- [ ] **Write failing regressions.** Persist a failed partial update, perform a skipped automatic check, recreate the updater, and assert failure/progress remains visible in both cases. Exercise a 409 followed by a valid changed manifest, two consecutive 409s, and a tampered refreshed manifest. Track completed pack hashes to prove the refresh does not redownload unchanged packs or retire an incomplete set.

```ts
it('preserves a partial failure during backoff and restart', async () => {
  const fake = storage(); fake.setFailure(a.id);
  const updater = createPackUpdater(fake.value, publicKey, () => 1000, () => 0);
  await updater.check();
  await updater.check();
  expect(updater.getStatus()).toMatchObject({ phase: 'error', completedPacks: 1, totalPacks: 2 });
  const restarted = createPackUpdater(fake.value, publicKey, () => 2000, () => 0);
  await restarted.check();
  expect(restarted.getStatus()).toMatchObject({ phase: 'error', completedPacks: 1, totalPacks: 2 });
});
```

- [ ] **Run RED.** `pnpm test tests/catalog-packs.test.ts tests/browser-packs.test.ts`.
- [ ] **Implement.** At most two verified-manifest passes occur per check. Detect the first `PackManifestChangedError` inside the pack loop, break to refetch, reload installed descriptors, and recalculate progress for the new set. Repeated transitions and ordinary failures enter existing exponential backoff. Persist progress/error with retry metadata. A skipped check emits persisted error state; older failure-only metadata gets a retry-pending message. Start/success clears stale error fields; success writes fresh state rather than spreading failed state.

```ts
if (!force && state.nextCheck && now() < state.nextCheck) {
  update({ ...state, phase: state.failures ? 'error' : 'idle',
    ...(state.failures ? { error: state.error ?? 'Downloads are waiting to retry.' } : {}) });
  return;
}
```

- [ ] **Run GREEN.** Repeat updater/browser tests and `pnpm test tests/catalog-update.test.ts` to catch core-updater compatibility regressions.
- [ ] **Commit.** `fix: resume changed pack manifests and retain retry errors`.

## Task 4 Resilient source timestamps

**Files:** Modify `lib/catalog-import.ts` and extend `tests/branded-catalog.test.ts`.

**Interfaces:** Keep `normalizeOffProduct(raw: OffProduct): ImportedFood | null` unchanged. Do not change extraction projection or infer serving units.

- [ ] **Write failing regressions.** Normalize the existing OFF fixture with `last_modified_t: 1e20`; expect a retained product without `checkedAt`. Build a JSONL containing that product and a valid second product and assert the build imports both. Cover the largest valid Date boundary and overflow, plus non-finite, negative, and absent timestamps.

```ts
expect(normalizeOffProduct({ ...off, last_modified_t: 1e20 }))
  .toMatchObject({ id: 'off-0030771094625' });
expect(normalizeOffProduct({ ...off, last_modified_t: 1e20 })?.checkedAt)
  .toBeUndefined();
```

- [ ] **Run RED.** `pnpm test tests/branded-catalog.test.ts` must show the current `RangeError` for the out-of-range source date.
- [ ] **Implement.** Validate the converted Date before formatting it. Never use the importer's wall clock as fallback.

```ts
const modified = new Date(raw.last_modified_t! * 1000);
food.checkedAt = Number.isFinite(raw.last_modified_t) && raw.last_modified_t! > 0
  && Number.isFinite(modified.getTime()) ? modified.toISOString() : undefined;
```

- [ ] **Run GREEN.** Repeat the branded tests, including the real build regression and existing Al Fresco serving assertions.
- [ ] **Commit.** `fix: skip invalid nutrition source timestamps`.

## Task 5 Immutable assets and publication preflight

**Files:** Modify `scripts/food-packs.mjs` and `.github/workflows/branded-food-packs.yml`. Create `scripts/publish-food-packs.mjs` and `tests/pack-publication.test.ts`; extend `tests/branded-catalog.test.ts`.

**Interfaces:** Preserve `buildFoodPacks` and `signPackSet`. Export a testable `verifyExistingPackAsset(pack, asset, readAsset)` from the publication script. It consumes a pack `{ sha256: string, bytes: number }`, an asset `{ name: string, size: number, digest?: string | null }`, and `readAsset: () => Promise<Uint8Array>`; it rejects size/hash mismatch and resolves `Promise<void>` only after digest verification. The command uses `gh` for authenticated release operations and does not export credentials.

- [ ] **Write failing regressions.** For each real built pack, independently SHA-256 its bytes and assert its URL basename is exactly `<pack.id>-<full hash>.sqlite`. With controlled release responses, verify an existing asset mismatch aborts before any manifest upload, a missing digest requires hashing the downloaded asset, a matching asset skips upload, and an absent asset uploads before the manifest. Test production decisions, not workflow text.
- [ ] **Run RED.** `pnpm test tests/branded-catalog.test.ts tests/pack-publication.test.ts`. Use local disposable files and no production signing key.
- [ ] **Implement.** Build at a temporary filename, close SQLite, hash, and rename. Keep the record-derived version in metadata and the descriptor.

```js
const temporary = join(output, `${id}.building.sqlite`);
buildCatalog(foods, temporary, version, source);
const bytes = readFileSync(temporary);
const contentHash = sha256(bytes);
const filename = `${id}-${contentHash}.sqlite`;
renameSync(temporary, join(output, filename));
```

The publication script reads the release and asset metadata through `gh api`, validates assets against the built pack set, and uses `sha256:<hex>` digests only when available and correctly formed. Otherwise download that exact immutable asset into `mkdtemp` storage and hash it. Upload missing SQLite assets only after preflight; upload the signed manifest last. Preserve existing source/provenance uploads. A mismatched existing asset is an error, never a `--clobber` operation. The workflow calls this script instead of its name-only skip loop.

- [ ] **Run GREEN.** Repeat build/publication tests and `node --check scripts/publish-food-packs.mjs`. Confirm every path is validated against a built descriptor and every upload-order failure is covered.
- [ ] **Commit.** `fix: publish content-addressed nutrition pack assets`.

## Task 6 Durable USDA routes

**Files:** Create `mobile/src/catalog/pack-routes.ts`, `mobile/src/catalog/native-pack-routes.ts`, and `lib/browser-local/pack-routes.ts`. Modify both pack storages, `mobile/src/catalog/pack-reader.ts`, `mobile/src/local/native.ts`, and `lib/browser-local/worker.ts`. Extend `tests/catalog-packs.test.ts`, `tests/native-packs.test.ts`, and `tests/browser-packs.test.ts`; create `tests/pack-routes.test.ts`.

**Interfaces:** Export these route contracts and bounded extraction from the shared file. Add an optional fourth argument to `createPackCatalog` so old tests and core callers stay compatible.

```ts
export type PackRouteResult = { packs: FoodPack[]; complete: boolean };
export type PackRouteLookup = (id: string, installed: FoodPack[]) => Promise<PackRouteResult>;
export async function readPackIds(db: SqliteConnection,
  page: (ids: string[]) => Promise<void>): Promise<void>;
// createPackCatalog(list, withReader, core, routes?: PackRouteLookup)
```

- [ ] **Write failing regressions.** Recreate storage/catalog after installing a USDA pack, then perform an exact ID lookup with no name search. Assert only its routed pack opens. A missing ID in a fully indexed set must open zero packs. Test stale hashes, overlapping partition generations, route-write failure, and a legacy pack requiring one-time indexing. Core lookup remains first and OFF barcode routing stays arithmetic.
- [ ] **Run RED.** `pnpm test tests/pack-routes.test.ts tests/catalog-packs.test.ts tests/native-packs.test.ts tests/browser-packs.test.ts`.
- [ ] **Implement.** Extract IDs from verified databases with stable cursor pagination. Use native `usda-routes.sqlite` in the expansion directory with these tables; close its connection before the food reader opens.

```sql
CREATE TABLE IF NOT EXISTS pack_routes(
  food_id TEXT NOT NULL, pack_id TEXT NOT NULL, sha256 TEXT NOT NULL,
  PRIMARY KEY(food_id, pack_id, sha256));
CREATE TABLE IF NOT EXISTS indexed_packs(
  pack_id TEXT NOT NULL, sha256 TEXT NOT NULL,
  PRIMARY KEY(pack_id, sha256));
```

On browser, persist `packs:usda-route:<id>` entries with pack ID/hash pairs and per-pack completeness markers. Commit them with activation; read-modify-write and retirement own the existing cross-tab lock. Keep paged per-pack ID metadata for bounded cleanup so snapshot storage needs no global key scan. Native routes can commit before descriptor activation because queries filter against installed hashes. Mark completeness only after all rows are durable. Route lookup returns matching installed packs and whether all installed USDA descriptors are indexed; fallback scans only when incomplete. Index legacy packs once before treating the route set as complete. Prune retired-hash route entries without deleting active generations.

- [ ] **Run GREEN.** Repeat route/storage tests and both type checks. Check that routes derive only from verified local data and never change food identities or signed schema versions.
- [ ] **Commit.** `fix: persist direct USDA expansion food routes`.

## Task 7 Browser OPFS storage and migration

**Files:** Create `lib/browser-local/pack-files.ts`, `lib/browser-local/pack-entries.ts`, `tests/browser-pack-files.test.ts`, `tests/e2e/nutrition-packs.spec.ts`, `tests/e2e/pack-harness-worker.ts`, `tests/e2e/pack-harness-server.mjs`, and `playwright.packs.config.ts`. Modify `lib/browser-local/packs.ts`, `lib/browser-local/sqlite.ts`, `lib/browser-local/worker.ts`, `scripts/browser-assets.mjs`, `build/offline-vite-plugin.ts`, `next.config.ts`, and `vite.config.ts`. Extend existing browser storage, SQLite, startup, offline, and build tests.

**Interfaces:** Keep `PackStorage.list()` returning `FoodPack[]`. Internally accept legacy bare descriptors or `{ format: 1, pack: FoodPack, location: 'indexeddb' | 'opfs' }`. Provide this filesystem boundary; real browser tests use actual OPFS, not a fake backend.

```ts
export interface BrowserPackFiles {
  stat(pack: FoodPack): Promise<PackFileStamp | null>;
  read(pack: FoodPack): Promise<Uint8Array<ArrayBuffer>>;
  stage(pack: FoodPack, response: Response): Promise<string>;
  activate(pack: FoodPack, temporary: string): Promise<void>;
  open(pack: FoodPack): Promise<SqliteConnection & { close(): void }>;
  removeTemporary(path: string): Promise<void>;
  retire(keep: FoodPack[]): Promise<void>;
}
// Factor the existing methods in lib/browser-local/sqlite.ts into this wrapper.
// MemoryDatabase is the existing interface in that file.
export function wrapSqliteDatabase(sqlite: SqliteModule, db: MemoryDatabase):
  SqliteConnection & { export(): Uint8Array; close(): void };
```

- [ ] **Write failing regressions.** Add a browser harness using the real pack storage, reader, updater, and SQLite modules with signed test manifests, real fixture pack files, and disposable browser profiles. Its separate test-worker entry uses a fixture public key passed to `createPackUpdater`; it never changes the production trust key or bundles a private key into the application worker. The harness server builds the Al Fresco fixtures and test worker, serves them under the same isolation headers, and owns its disposable output directory. Cover legacy migration and reopen, no-OPFS fallback, lost isolation after migration, quota/commit failure, corrupt files, same-size modification detection, reader/update overlap across two tabs, and interrupted repartition. Count complete-file reads/hashes separately from SQLite connections; warm searches must perform neither whole-file verification nor IndexedDB pack-byte reads on the OPFS path. Assert only one expansion connection is open. Extend `setup()` unit tests to prove replacements clear legacy `packs:previous:*` without copying old bytes and failed commits retain old activation.
- [ ] **Run RED.** `pnpm test tests/browser-packs.test.ts tests/browser-pack-files.test.ts tests/browser-local-sqlite.test.ts tests/browser-startup.test.ts`. Run the new E2E tests against the current compiled app to demonstrate missing OPFS/migration behavior. Keep tests isolated from the user's browser profile.
- [ ] **Implement.** Expose regular OPFS support from the pinned SQLite module and factor the existing connection wrapper so both memory and OPFS databases use identical query methods. Serve `/offline/sqlite3-opfs-async-proxy.js`; copy it with the WASM artifact and include it in shell-cache versioning. Use file paths derived only from validated hashes, read-only opens, `query_only`, `trusted_schema=OFF`, and a 2 MiB SQLite page cache. Add document/worker isolation headers through framework configuration and Vite; verify they reach the compiled Worker. Do not use `opfs-sahpool`.

```ts
const db = new sqlite.oo1.OpfsDb(`/gramello-food-packs/pack-${pack.sha256}.sqlite`, 'r');
const connection = wrapSqliteDatabase(sqlite, db);
await connection.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-2048;');
```

Use Task 1's bounded sink for temporary OPFS writes and Task 2's verification cache for immutable file reads. Close temporary writable streams on all outcomes. Verify staged bytes and SQLite before final-file creation, verify the destination, then commit its activation entry and route keys. Legacy migration commits the new location while clearing old bytes and previous-byte keys in one transaction. A failed commit retains the old descriptor/bytes. Never retire an installed referenced file. File cleanup and migration use `gramello:food-packs`; network transfers do not hold it. Re-read the current index under that lock before using a descriptor; stale callers must not read a new hash under an old pack ID.

Keep IndexedDB installation/read fallback when OPFS is unavailable. After migration, use asynchronous file reads with the memory reader if regular OPFS SQLite is unavailable but filesystem reads still work. If even filesystem access fails, report the source issue without wiping metadata or redownloading merely due to missing capability. Preserve core and diary access. Bound fallback verification memo entries and invalidate them on commits and failed integrity checks; acknowledge that fallback still loads whole pack bytes.

- [ ] **Run GREEN.** Repeat unit tests, both type checks, compiled build, and `pnpm exec playwright test --config playwright.packs.config.ts`. Add browser projects for Chromium, Firefox, and WebKit to that dedicated configuration without changing existing mobile-emulation tests. Separately exercise the compiled application in existing E2E coverage to verify offline cache contains the proxy, shell keeps isolation headers, public barcode images still load, and current recovery/navigation flows remain usable. Run two-tab tests with one update and one reader against real OPFS.
- [ ] **Commit.** `fix: migrate browser nutrition packs to bounded file readers`.

## Task 8 Whole branch verification and shipping handoff

**Files:** Update `docs/food-packs.md` and create `docs/food-pack-review-results.md`. Update the implementation checkboxes only for steps actually completed.

**Interfaces:** No new application contracts. The result document maps all twelve review items to fixes/tests or the OFF schema rejection and records platform limitations. Ship application changes, not an unsigned million-food dataset.

- [ ] **Inspect and verify.** Run `git diff --check`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm --filter @gramello/mobile exec tsc --noEmit`, `pnpm build`, and `pnpm test:smoke`. Run Python extraction tests with the pinned requirements in an isolated virtual environment: `python -m unittest discover -s scripts/tests -p 'test_food_pack*.py'`. Run the dedicated real-browser pack integration suite and existing diary/recovery E2E coverage. Record exact failures rather than increasing smoke timeouts or silently skipping tests.
- [ ] **Check iOS.** Use an isolated simulator/test-pack fixture state and a separate Metro port if necessary; do not replace or erase the user's current diary. Verify bounded transfer, repair, warm search, restarted USDA lookup, and offline reuse. Report Android runtime checks as unverified unless actually run. Do not claim host SQLite tests establish phone performance.
- [ ] **Review the whole diff.** Follow the required review skill for the chosen execution method, using the current branch and approved design. Resolve valid new findings with failing regressions before rerunning final verification. Check that no dataset blobs, signing material, unrelated edits, or changes from the original worktree enter the branch.
- [ ] **Document and commit.** Describe OPFS isolation, safe migration/fallback, no unused previous browser copies, verification reuse, and durable local routes. Keep the invalid OFF projection decision supported by the observed schema. Commit documentation only after fresh verification results are known.
- [ ] **Hand off.** Provide the branch, worktree, test results, addressed-finding map, and any platform limitation. Follow the user's shipping direction and the finishing skill for repository integration; never merge with red checks or publish nutrition releases without separate authority. Attach any created PR with the native artifact tool. Preserve the managed worktree while its work is needed.

## Plan self review

The tasks cover every actionable finding: bounded manifests and transfers in
Tasks 1 and 2; corruption repair and native verification in Task 2; manifest
transitions and retry status in Task 3; invalid dates in Task 4; immutable asset
hashes and release preflight in Task 5; durable USDA routes in Task 6; unused
browser copies, reader performance, migration, and fallback in Task 7. Task 8
verifies the integrated behavior and records the unsupported OFF column without
introducing it. Shared interface names are defined where produced and repeated
where consumed. Cross-platform contracts require sequential integration even
when independent implementation tasks are delegated.
