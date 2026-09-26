# Native local-data implementation

The iOS/Android entry point is `mobile/App.native.tsx`. Metro resolves `Session.native.tsx`, whose API adapter invokes a SQLite repository in process. The Expo browser app and hosted web edition open without login and use an anonymous browser cookie for their separate server-stored diaries. Native builds do not use the hosted API. The anonymous usage analytics already present on `main` is retained: fixed action/screen names only, with diary contents excluded by its existing allowlist. Leaving the Segment write key unset disables it.

## Storage and recovery

`gramello-personal.sqlite` is persistent application data. Versioned, validated JSON records are indexed by kind and calendar date. Repository operations serialize on the connection so import/export transactions cannot capture another UI write. Native IDs come from Expo Crypto. Failed writes/imports roll back.

A `.gramello` file is UTF-8 JSON with `format: "gramello"`, `version: 1`, `exportedAt`, and `records`. Each record has `kind`, `id`, `date`, and validated `value`. It contains food and recipe snapshots, goals, diary and hydration. It contains no credentials or catalog databases. Portable archives are limited to 32 MiB and 200,000 records. Imports reject unsupported formats, duplicate keys, impossible dates and files above those limits. Oversize exports fail explicitly; replacement is refused before mutation if the current diary cannot fit in a restorable recovery archive. Import is replacement after confirmation, not merge. A SQLite recovery row preserves the previous diary and Settings → Advanced exposes recovery. Both platforms use the same format.

CSV exports quote fields and neutralize leading spreadsheet formula characters. Exports go through the OS share/save interface; Gramello has no personal cloud-data integration. Temporary exports stay in the OS-managed cache because Android share targets may read them after the sharing call returns.

Hosted-account migration and all browser application work are out of scope for this change. Native exports can move data between native installations.

## Catalog format and publishing

The starter contains 50,322 foods: 7,793 USDA SR Legacy foods and all 42,529 previously imported restaurant foods across 150 catalogs. Downloaded databases live in the cache, excluded from normal device backup. The current app's bundled foods remain available beneath downloaded catalogs so an older or narrower update cannot hide restaurants. Catalogs use their own connection and cannot replace the personal database.

Barcode lookup prefers installed and previously cached foods, then calls the public Open Food Facts API directly for unknown codes. Successful results are validated and saved in a separate persistent `gramello-food-cache.sqlite`, including equivalent UPC/EAN keys. Lookup failures and missing nutrition are not cached. This cache survives catalog replacement, app restart, and personal-data imports; diary entries and recipes retain their own nutrition snapshots for export. It is not itself included in `.gramello` exports. Unknown codes are never guessed from similar products.

Typing a name searches only on-device foods. “Search Open Food Facts online” explicitly requests additional matches and caches them for future offline searches and scans. Provider requests have a 10-second timeout, accept cancellation, and do not hold the personal database's transaction queue. The app limits product reads to 15/minute and explicit searches to 10/minute, following [Open Food Facts guidance](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/). No shared API key, account, or Gramello backend is required. Only the query or barcode is sent to Open Food Facts; diary records remain local.

Each update envelope contains an exact UTF-8 `payload` string and a hex Ed25519 `signature`. The payload defines schema version, catalog version/date, HTTPS asset URL, byte count, SHA-256 and food count. The app verifies signature, download length/hash, SQLite integrity, schema, search count, and every food before activation. An atomic SQLite metadata write selects the next database for future launches. The old connection remains available until active readers finish.

At first launch and on foregrounding, an eligible check runs silently. Successful checks defer the next automatic check by 24–25 hours; errors retry with bounded backoff on a later foreground opportunity. The update check in Settings → Advanced bypasses the interval. There is no promise of downloads while an app is closed. Existing data remains usable throughout failures.

The current 40.6 MB pack is shipped uncompressed to avoid adding a native decompression dependency. Release filenames are unique per workflow run. The mutable `food-catalog` prerelease contains immutable database assets plus a replaceable signed `manifest.json`. It does not become GitHub's latest application release or trigger native app builds. Configuration is in `mobile/catalog-config.json`; a dedicated catalog repository can be substituted by changing that origin and workflow destination.

### Signing setup before the first data release

A matching Ed25519 private key was generated locally at `.catalog-work/signing-key.pem` (ignored by Git, permissions 0600). Only its public key is checked into the app configuration. Securely retain the private key outside this disposable worktree before relying on it for releases.

Set the repository Actions secret `CATALOG_SIGNING_KEY` from that PEM file. The publisher validates that its public key matches the app's pinned key. Never commit the private key, include it in app environment variables, or print it in logs.

```sh
gh secret set CATALOG_SIGNING_KEY --repo edwardofclt/gramello < .catalog-work/signing-key.pem
```

After merging, run **Publish food catalog** on `main`. The workflow also runs on changes to the approved catalog inputs. It uploads the database before replacing the manifest. Until that release exists, native builds use their bundled foods and show a recoverable update error only in Settings → Advanced.

Changing the signing key requires an application update; keep the current key stable. Changing the USDA snapshot requires regenerating the normalized input and, when desired, the bundled SQLite seed. Do not regenerate the database at runtime or ship restaurant data without cleared redistribution rights.

## Release and verification

Without `CATALOG_SIGNING_KEY`, the publisher explicitly skips publication with a setup notice. Configure the secret and rerun the workflow to enable public catalog updates.

Production EAS Android builds produce an AAB for Google Play. Application releases also build a signed APK with the `production-apk` profile and attach it to the GitHub release for direct installation. The APK workflow supports manual reruns for existing stable releases. iOS TestFlight continues through the existing workflow. Store pricing, agreements, screenshots, actual store submission, and customer migration timing remain release operations.

Run:

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm --filter @gramello/mobile typecheck
pnpm lint
pnpm --filter @gramello/mobile export
```

Before a store submission, validate on real iOS/Android devices: first launch without network, local persistence after process termination, import cancellation/confirmation/recovery, save destinations including installed cloud providers, barcode scanning, and a signed catalog update over a slow/interrupted connection. JS bundle export alone is not a native runtime test.
