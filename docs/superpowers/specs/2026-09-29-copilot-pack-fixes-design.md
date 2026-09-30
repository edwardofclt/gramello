# Nutrition pack review fixes design

Resolve the valid Copilot findings from merged PR #41 in the separate
`codex/copilot-review-fixes` worktree. The user approved file-backed browser
expansion packs, migration of existing packs, and fallback access when the new
storage is unavailable. This document specifies that change and the associated
review fixes. It is a design for review, not a claim that fixes are implemented.

The existing [US branded catalog design](2026-09-29-us-branded-catalogs-design.md)
continues to define nutrition, market filtering, source precedence, attribution,
and release boundaries. This document supersedes its browser expansion storage
mechanism only. Personal diaries, custom foods, provider cache, bundled catalog,
and core catalog updates retain their existing storage and behavior.

## Review findings and decisions

Copilot supplied eleven inline findings and a further retry-state finding in a
review summary. Ten inline findings and the summary finding require fixes.

| Finding | Decision | Required behavior |
| --- | --- | --- |
| Final SQLite hash missing from asset filenames | Valid | Immutable asset names include the full final database SHA-256; publishing rejects existing-name/content mismatches. |
| Browser downloads fail when the current manifest changes | Valid | A 409 triggers one immediate verified-manifest refresh and resumes from installed packs without hourly backoff merely for that transition. |
| Browser stores unused previous pack bytes | Valid | Replacement does not copy old bytes to `packs:previous:*`; legacy copies are cleared atomically with activation. |
| Browser searches reread and hash the entire catalog | Valid | File-backed readers use SQLite page reads and cache successful verification of unchanged immutable files. |
| Native downloads write oversized responses before rejecting them | Valid | The transfer stops before any chunk exceeding the signed size is written. |
| Corrupt native files require a second retry to repair | Valid | One install attempt removes the failed content-addressed file, downloads a verified replacement, and activates it. |
| Native readers hash packs on every open | Valid | Reader verification is reused only for the same hash, size, and file modification identity; repair checks can force verification. |
| USDA exact ID lookup scans packs after restart | Valid | A durable local USDA identity index selects installed content directly without depending on an earlier search. |
| OFF projection omits `serving_quantity_unit` | Invalid as proposed | The pinned Parquet schema does not contain that column. Do not add an unconditional projection or infer grams from milliliters. |
| Manifest limits apply after full buffering | Valid | Browser, native, and relay code enforce a byte cap while reading, before parsing or signature verification. |
| Out-of-range source timestamps abort imports | Valid | Invalid dates omit `checkedAt`; other valid nutrition records continue importing. |
| Backoff checks erase failures and progress | Valid | Skipped checks preserve the failure and progress; restart exposes persisted retry-pending state. |

The OFF schema decision was checked against the imported snapshot revision
`5ac8dbc2a2b1978924686e11798fe136eb13902a`. Its serving-related columns are
`serving_quantity`, `serving_size`, `product_quantity`, `product_quantity_unit`,
and `quantity`. This rejects the suggested projection change, not the possibility
of incomplete serving information in upstream data. Existing explicit-unit
normalization stays unchanged.

## Browser file storage

Use the existing SQLite WASM package's regular `opfs` VFS in the browser worker.
OPFS is the browser's origin-private filesystem. Store expansion databases in
`/gramello-food-packs/pack-<sha256>.sqlite`; keep activation descriptors in the
existing IndexedDB snapshots store. Files remain read-only after installation.
Neither file paths nor database SQL come from untrusted client input.

Do not use `opfs-sahpool` for authoritative storage with the currently pinned
SQLite package. Inspection of version `3.53.4-build1` shows that its initialization
failure handler calls `removeVfs()`. Retrying an initialization must never wipe
an existing catalog. Do not change the dependency version as part of these fixes.

The regular OPFS VFS requires cross-origin isolation. Configure
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless` for application documents and
worker assets in development and the compiled Worker. Serve the package's OPFS
proxy script at a stable same-origin offline-asset URL alongside `sqlite3.wasm`.
Confirm these settings in the built application, not only the development server.
Check current barcode images, navigation, recovery, and offline flows for
regressions. Unsupported isolation or OPFS capability selects fallback storage;
it must not prevent the diary from opening.

Keep the existing `gramello:food-packs` cross-tab lock around reader opens,
activation, migration, and file cleanup. Keep the independent
`gramello:food-pack-update` lease around a whole update. Do not hold a reader
lock for a network transfer. Open at most one expansion database at a time,
close it in `finally`, and retain bounded ranked candidates as today. Use a
bounded SQLite page cache rather than caching all pack files in JavaScript.

Use a versioned activation entry containing the validated `FoodPack` descriptor
and a storage location of `indexeddb` or `opfs`. Read legacy bare descriptors as
`indexeddb` entries so installed packs are recognized without redownload. Public
catalog APIs continue exposing `FoodPack[]`, not internal storage metadata.

### Migration and activation

For each legacy pack, migrate under the cross-tab reader lock, one pack at a
time. Hash and inspect its current IndexedDB bytes before importing them. Import
to the content-addressed OPFS path, verify the resulting file and SQLite schema,
then commit its OPFS activation entry while clearing that pack's old IndexedDB
bytes and `packs:previous:*` value in the same IndexedDB transaction. Do not
delete the old bytes before transaction completion. If the transaction fails,
the legacy descriptor and bytes remain authoritative and readable.

New downloads use a temporary file, a bounded transfer, hash verification, and
SQLite inspection. Copy or rename the file to its immutable final path using
supported filesystem operations, then verify the completed destination before
committing the activation descriptor. Atomic rename support is not required:
the descriptor switch is the activation boundary. A failed descriptor commit leaves the previous
activation untouched. An unreferenced new file is an orphan, not an activation;
cleanup removes it later under the reader lock. Cleanup operates only inside the
expansion directory and never removes a file referenced by an installed entry.

Only remove unused files and legacy previous-byte copies that belong to this
pack storage. Retire old-generation coverage only after the complete wanted set
has installed, preserving the existing interrupted-repartition behavior.

### Verification and fallback

Verify each persisted file on its first reader use in a worker session. Memoize
that success against the immutable filename, descriptor hash, byte length, and
observed file metadata. Changed size or modification metadata invalidates the
memo. Installation, migration, repair, and forced availability checks verify bytes
again and invalidate affected memo entries. Never persist an unqualified
"verified forever" flag. Do not cache the full catalog's bytes in memory.

When OPFS is unavailable, continue using existing IndexedDB packs and support
new installations through the current atomic snapshot path. Avoid repeated
hashing there, but document that the fallback still loads an entire pack into
memory for SQLite reads and does not achieve OPFS's page-read performance.

If capability is temporarily unavailable for already migrated OPFS packs, read
the OPFS files through the asynchronous filesystem API into the existing
one-pack memory reader when that API is available. Do not retain a second full
catalog solely as a fallback copy. If the filesystem itself is unavailable,
report expansion unavailability; leave its descriptors and files intact and
keep core foods and personal data usable. Do not reinterpret this as a request
to redownload or erase installed data.

## Bounded downloads and native repair

Introduce shared bounded-response helpers for successful manifest and pack
responses. Count actual UTF-8 bytes read, not JavaScript character count or
`Content-Length` alone. The manifest envelope cap is 520,000 bytes. Packs retain
the signed exact length and 32 MiB maximum. Cancel the stream on overflow,
truncation, read failure, or abort and release its reader lock. A misleading or
missing `Content-Length` cannot bypass the limit.

Native code uses `expo/fetch`, whose response body supports streaming, rather
than assuming React Native's global fetch provides a readable stream. Write
accepted chunks to an Expo file handle in the expansion directory. A chunk that
would exceed the descriptor length is rejected before writing it. Close file
handles before verification or movement; delete only the failed temporary file.
Preserve the cellular-download behavior and existing timeouts.

An existing native file is reusable only if its signed size and hash match.
Remove a corrupt file before deciding whether a download is needed, not after
skipping the network. Verify a replacement temporary file and inspect SQLite
before moving and activating it. Prior versions and their metadata remain
untouched until successful activation. Serialize verification and activation
with reader opens so repair never deletes an in-use database.

Reuse native verification for unchanged content-addressed files within a storage
session, keyed by hash, byte length, and last-modified metadata. Missing or
changed metadata triggers verification, not a trusted default. Availability
checks used for repair can bypass this cache.

## Manifest transitions and retry status

Keep the download relay restricted to URLs in a publisher-signed manifest. Do not
solve transitions by accepting a client-provided URL, unsigned descriptor, or
unsigned old-manifest reference.

Represent a relay 409 as a distinct manifest-change error. On the first such
error in an update, refetch and verify the manifest immediately, then restart
the pack-set loop against it. Already installed matching hashes are skipped as
usual. Do not retire old packs until the refreshed set completes. Allow one
immediate refresh per check; repeated publisher changes enter normal backoff,
preventing an unbounded restart loop. Other transfer failures retain their
normal checkpointing and retry behavior.

Persist the pack updater's error and progress alongside its failure count and
next check time. A skipped automatic check preserves that state. After restart,
a persisted failure remains an error with retry-pending information rather than
becoming idle. Clear error state only when a fresh attempt starts; successful
completion resets failures and stale error metadata. The core updater's storage
contract and combined-updater behavior must remain compatible.

## Durable USDA identity lookup

Build a local USDA route index from food identities in each already verified
pack during installation and legacy migration. Key entries by food ID, pack ID,
and content hash, so an unfinished replacement cannot overwrite the route for
an installed generation. This is derived local metadata, not an unsigned remote
authority, and does not change published manifest or food schema versions.

On native, keep the index in a separate expansion-directory SQLite database.
Close its connection before opening a nutrition pack. On browser, use dedicated
IndexedDB route keys and commit them with the activation descriptor. Keep USDA
route metadata separate from OFF databases and personal diaries. Populate routes
in bounded pages and mark an indexed pack complete only after all its identities
are written durably.

Exact lookup checks core first, as today, then queries routes for the installed
descriptors. Ignore stale hashes and removed packs. Apply the current newest
generation preference when multiple installed generations contain an identity.
A missing ID in a fully indexed installed set returns null without scanning
nutrition packs. Older installations without an index are indexed once from
verified packs; until that completes, the existing scan remains a compatibility
fallback, not the normal post-restart path. OFF lookup continues to use barcode
partition arithmetic.

## Immutable publication and resilient import

Keep the food-derived catalog version inside SQLite metadata; putting the final
database hash inside the database itself would introduce a circular hash
dependency. Build into a temporary filename, close SQLite, hash the final bytes,
and rename the asset to `<pack-id>-<full-sha256>.sqlite`. The signed descriptor's
hash and URL then identify those exact final bytes. Its existing version remains
the catalog metadata version.

Before publishing a new manifest, verify all existing-name assets match the
expected hash and byte count. Use the release asset digest when it is present
and SHA-256; otherwise download that exact asset to a task-specific temporary
directory and hash it. A mismatch fails publication before manifest replacement;
never clobber an immutable SQLite asset. Test publication decisions through a
script with controlled release responses, not assertions about workflow text.
Do not publish a release, access a private signing key, or change the app trust
key while implementing these fixes.

For OFF timestamps, create the date from source seconds and check the resulting
time value before calling `toISOString()`. Omit `checkedAt` for non-finite,
nonpositive, or out-of-range timestamps. Preserve valid nutrition records and
deterministic builds; do not substitute the importer's wall clock.

## Verification and completion criteria

Use test-first regressions for the valid review findings. Exercise real SQLite,
real response streams, and transactional snapshot behavior; replace only
external network or native-platform boundaries where necessary.

Browser integration tests must exercise the real SQLite OPFS backend in current
Chromium, Firefox, and WebKit. Cover offline reopening, two tabs, update during
search, interrupted migration, quota failure, corrupt files, and unsupported
capability fallback. Assert warm searches do not read or hash complete pack
bytes, and that peak open expansion connections remain one. Preserve Al Fresco
name search, barcode precedence, and source disagreement fixtures.

Native tests must demonstrate cancellation before oversized chunks are written,
same-attempt corruption repair, warm verification reuse, changed-file detection,
and durable exact USDA routes after recreating storage. Run an iOS simulator
check with isolated test-pack state; do not erase the user's existing simulator
diary. Unit tests alone do not establish Android behavior, so report any platform
verification limitation explicitly.

Run the full `pnpm test` suite, TypeScript checks for web and mobile, the compiled
web build and diary smoke test, relevant browser integration tests, and Python
extraction tests. Record red/green regression evidence and the final commands in
the implementation handoff. The reviewed baseline in this worktree was 631
passing tests on 2026-09-29; that is not verification of the future fixes.

Completion requires matching each actionable finding to its regression and fix,
documenting the unsupported OFF projection with schema evidence, updating pack
storage documentation, and leaving a clean, reviewable branch. Creating a new
PR or publishing datasets is a separate user-directed action because PR #41 is
already merged.

## References

- [Copilot review on PR 41](https://github.com/edwardofclt/gramello/pull/41)
- [SQLite persistent storage and OPFS](https://sqlite.org/wasm/doc/trunk/persistence.md)
- Existing package source: `node_modules/@sqlite.org/sqlite-wasm/dist/index.mjs`
- Existing source and release contract: [US product packs](../../food-packs.md)
