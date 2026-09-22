# Native implementation decisions and validation

Scope: native iOS and Android only. Browser features, hosted-account migration,
and browser UI validation were explicitly removed at the user's request.

## Implementation decisions

- Ruling: publish a dedicated `food-catalog` prerelease in the existing public
  repository. This avoids provisioning another repository; the configured origin
  can be moved later. Cost if changed: publisher and app origin configuration.
- Ruling: the initial 4.9 MB catalog is uncompressed SQLite. This avoids native
  decompression code. Cost: a larger download than a compressed pack.
- Ruling: `.gramello` backups are versioned UTF-8 JSON; CSV is a separate export.
  The complete archive is portable without a ZIP dependency. Cost: larger backup
  files; imported backups are capped at 32 MiB.
- Ruling: prepare implementation before release configuration. The user subsequently
  authorized opening and merging a PR. Signing-secret provisioning and public
  catalog publication remain release steps. Cost: automatic downloads begin only
  after the first signed release exists.
- Ruling: only approved USDA public-domain records ship in the starter. Restaurant
  data needs redistribution clearance before inclusion. Cost: less initial food
  coverage and no packaged-product barcodes in this seed.

## Evidence so far

- Real SQLite tests cover persistence, historical nutrition snapshots, recipes,
  custom foods, hydration, goals, validated import/recovery, transaction rollback,
  concurrent writes, and CSV escaping.
- Signed-manifest tests cover tampering, incompatible metadata, single-flight
  updating, failed installs, retry intervals, and failed metadata persistence.
- The exact 7,793-food bundled database passes the native startup validator.
  FTS search and canonical barcode lookup are exercised against real SQLite.
- A local publisher run passed signature verification using the app's pinned
  public key, plus byte count, SHA-256 and record-count verification.
- The six-month native Trends mismatch was reproduced by a failing test and fixed
  to accept the screen's 183-day range.

## Fresh review and fixes

One fresh read-only reviewer found an important large-diary recovery failure.
The 32 MiB external import limit was not applied when exporting or creating a
recovery snapshot. Two regression cases first failed, reproducing both export
and replacement; they now pass. Exports and recovery snapshots use the same
validator as imports. Oversize exports fail explicitly, and replacement rolls
back before touching records if a restorable recovery snapshot cannot be made.
This intentionally caps portable archives rather than silently creating unusable
backups. Existing records remain available on the device.

The reviewer also flagged native source labels inherited from the hosted UI.
Ruling: treat this as a native product/ privacy correction, because private custom
foods were labeled as community submissions. Food search now identifies the
installed catalog and My foods. Cost if coverage expands: update source labels.

Review exclusions were accepted: browser work was explicitly excluded; store
pricing/submission, signing-secret provisioning and catalog publication are
release operations; physical-device checks cannot be established by code review.
There are no deferred code-review findings.

## Verification

- Full tests, root/mobile TypeScript, ESLint and both native JS exports passed
  before the final review; final rerun results follow below.
- An iOS Release simulator build succeeded (0 errors; native dependency warnings).
  The app opened without login and logged a USDA banana and 250 mL of water into
  its local diary. Settings displays the installed USDA catalog while the absent
  public release produces only a recoverable update status.
- Android SDK/emulator tooling is absent on this host. Android JS export passed;
  native Android compilation and physical-device checks remain release validation.


Final code checks (2026-09-22): `pnpm test` **209/209 passed**;
root and mobile TypeScript passed; ESLint passed with three pre-existing warnings;
`git diff --check` passed; Expo iOS/Android Hermes exports passed and include the
bundled 4.9 MB catalog. Review fix regression cases passed for both an oversize
export and an oversize pre-replacement recovery snapshot.

The iOS simulator successfully presented the OS share sheet, saved a `.gramello`
backup under On My iPhone, selected it through the document picker, displayed its
two-record import preview, and completed confirmed replacement.

The final source also passed a second iOS Release build (0 errors). After the
install/restart, the imported banana entry and 250 mL water entry remained intact.

On the final simulator build, recovery restored the earlier 250 mL water total
from a later 750 mL state, retaining the banana entry. The six-month Trends view
also loaded successfully after recovery.

## PR integration

Merged current `main` into the implementation branch, preserving the Gramello
package/tooling rename, existing anonymous Segment analytics, and unrelated
website/release changes. The local API adapter uses the existing analytics filter;
no diary contents enter analytics. Production keeps the existing public Segment
write key while dropping native Auth0/API configuration.

On the combined source: **237/237 tests passed**; root/mobile TypeScript, ESLint,
and iOS/Android Hermes exports passed. The catalog workflow now skips explicitly
when its signing secret is absent, so merging an unfinished release setup does
not attempt an unsigned publication. The prior simulator checks preceded this
integration; the combined native bundles include the retained analytics modules.
