# US-market product packs

The existing starter SQLite database remains unchanged. Two independent source
catalogs extend it: [USDA Global Branded Food Products](https://fdc.nal.usda.gov/download-datasets/)
and [Open Food Facts' official product dataset](https://huggingface.co/datasets/openfoodfacts/product-database).
FoodRepo and Cronometer CRDB are not imported.

USDA products require `marketCountry=United States`; OFF requires the explicit
`en:united-states` country tag. This is market coverage, not country of manufacture.
Missing, obsolete, incomplete or implausible products are omitted and counted in
the import report. All four macros are required; missing values never become zero.

## Build locally

Use Node 24 and the repository's pinned pnpm dependencies. Dataset processing
requires Python 3.12+ and the pinned `scripts/food-packs-requirements.txt`:

```sh
python3 -m venv .catalog-work/venv
.catalog-work/venv/bin/pip install -r scripts/food-packs-requirements.txt
.catalog-work/venv/bin/python scripts/extract-food-packs.py .catalog-work/raw
node scripts/food-packs.mjs .catalog-work/raw/usda.jsonl .catalog-work/raw/off.jsonl \
  .catalog-work/packs https://github.com/edwardofclt/gramello/releases/download/food-catalog/
```

Choose a fresh output directory each build. The extraction streams USDA's ZIP
without expanding its multi-gigabyte JSON and projects only necessary OFF Parquet
columns. The HF revision is resolved once and recorded; `--off-revision SHA` pins a
repeatable snapshot. `--off-parquet /absolute/path/food.parquet` supports a local
copy of that exact revision. Bulk processing does not scrape per-product APIs.
Expect hundreds of MB of downloads (more with a full local Parquet copy), several
GB of temporary storage and a potentially long first import. Keep generated
datasets, staging files and SQLite packs under ignored `.catalog-work/` or
`catalog-release/`, not in git.

The builder normalizes with `lib/catalog-import.ts`, stages records on disk, then
partitions each source by canonical GTIN modulo 128. Each pack has FTS5, source
metadata, a barcode index, a content-derived version and a 32 MiB maximum. Use the
optional fifth argument to increase the partition count (maximum 256) if needed.
Foods are identified by FDC ID or original OFF code; zero-padded 14-digit GTINs
equate UPC/EAN representations without merging source records. Name search retains
both sources; barcode lookup prefers USDA and then OFF. For identical OFF IDs,
fresh cached provider nutrition continues to supersede older downloaded OFF data.
USDA standardized nutrient bases follow the provider's g/mL serving unit; see
[USDA's documentation](https://fdc.nal.usda.gov/GBFPD_Documentation/).

Pack IDs include both partition count and bucket. An interrupted repartition
retains old-generation coverage until all new packs have activated. Browser
workers hold a distinct cross-tab update lease so a stale updater cannot retire
another tab's newer installation; readers do not wait for entire downloads.

Verify a complete local build and measure real SQLite WASM search with:

```sh
node scripts/verify-food-packs.mjs .catalog-work/packs
```

This checks every food record, hashes every database, queries the Al Fresco
barcode/name and writes `verification-report.json`. Host timings do not prove
performance on lower-memory phones or browser devices.

## Signing and publishing

The unsigned local output is `pack-set.json`. With `CATALOG_SIGNING_KEY` containing
the existing trusted Ed25519 PEM, the builder also writes `pack-manifest.json`.
It refuses a different key; never change the app public key to publish a test pack.

After merging, manually run **Publish US branded food packs** on `main`. It needs
the repository's existing `CATALOG_SIGNING_KEY` secret. It uploads immutable
content-addressed databases named `<pack-id>-<full-final-sha256>.sqlite` before
replacing the signed manifest. Publication checks every existing asset's size and
SHA-256 first (downloads and hashes it when GitHub provides no digest); a mismatch
aborts before manifest replacement and never clobbers a SQLite asset. It does not
replace the legacy `manifest.json` or bundle the expansion into the app binary.
Run the workflow again to refresh source snapshots; clients check automatically
about daily, downloading only changed packs. Old releases remain available for
clients installing a previously fetched manifest.

Native and web automatically check on launch, foreground and once per minute
while active (metadata skips network until due). Downloads include cellular,
run sequentially, verify size/hash/SQLite fields before activation and checkpoint
each pack. Manifests stop at 520,000 actual UTF-8 bytes, and an overflowing pack
chunk is rejected before writing it. A relay manifest transition refreshes the
verified manifest once immediately; repeated transitions enter normal backoff.
Retry backoff starts at one hour and caps at one day, preserving the error and
completed-pack progress across skipped checks and restart. Native retains one
previous pack per partition; browser activation clears unused previous bytes.
iOS/Android do not guarantee continued execution
after the OS suspends or terminates the app; checks resume when foregrounded.
Browser storage quotas may prevent a complete install; existing packs and diaries
remain usable, and Settings reports the failure and completed-pack progress.

## Local readers and browser migration

Native repairs a corrupt content-addressed file in one install attempt. Native
and browser readers verify files on first use and reuse verification only while
hash, byte length and modification metadata agree. Repair checks force hashing;
missing or changed metadata never means "trusted forever". Durable, locally
derived USDA routes select the correct installed pack after restart without a
previous name search. Routes include the content hash, ignore retired generations,
and do not change nutrition identities or source precedence.

Browser expansion packs use the pinned SQLite WASM package's regular `opfs` VFS
in the dedicated worker. Files live at
`/gramello-food-packs/pack-<sha256>.sqlite`; IndexedDB holds validated activation
pointers and route metadata, not a second catalog copy. Readers are read-only,
use a 2 MiB SQLite page cache, and hold one expansion connection at a time. Warm
OPFS searches do not read/hash entire files or load IndexedDB pack bytes.

Documents and offline worker assets need `Cross-Origin-Opener-Policy: same-origin`
and `Cross-Origin-Embedder-Policy: require-corp`. The compiled Worker wrapper and
static `_headers` both enforce this; public food images request anonymous CORS.
The offline shell caches the OPFS proxy, including both `?vfs=opfs` and
`?vfs=opfs-wl` variants so cached Worker response URLs retain their driver argument.
Do not use `opfs-sahpool` with the pinned dependency: its failure cleanup is not
appropriate for authoritative installed catalog files.

Legacy bare descriptors remain readable. Migration validates one pack, stages
and verifies its file, then atomically switches its pointer while clearing old
IndexedDB bytes and `packs:previous:*`. A failed transaction leaves the original
bytes and pointer usable. Reader opens, activation, migration, and cleanup share
the cross-tab reader lock; network transfers do not hold that lock. Old partition
coverage remains until the complete replacement set has installed.

Without regular OPFS support, new installs keep the IndexedDB memory-reader
fallback. Already migrated files can use asynchronous OPFS reads if isolation is
lost. These fallback readers still load a whole pack; they do not promise OPFS's
page-read performance. If filesystem access itself is unavailable, report the
source issue and preserve activation metadata/files and diary access—do not wipe
or redownload merely because capability is missing. See
[review verification and limits](food-pack-review-results.md).

## Source rights and separation

USDA FoodData Central is CC0/public domain. Credit USDA FoodData Central and retain
its product source links. This is industry-submitted label data, not a medical
assessment or a guarantee of accuracy.

Open Food Facts database data is ODbL 1.0, individual database contents are DbCL,
and product images have separate CC BY-SA terms. No images are imported. Credit
**Open Food Facts**, link [the project](https://world.openfoodfacts.org) and
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), and make OFF-derived
database packs plus the reproducible extraction/modification recipe publicly
available under ODbL. Release provenance records the official dataset revision;
the source recipe also remains available in this repository at the release SHA.
See [OFF's legal guidance](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/)
and [local cache guidance](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/creating-a-local-cache-of-open-food-facts-data/).

OFF packs are physically separate from USDA and existing restaurant/Nutritionix
data, including their FTS and barcode indexes. Shared application queries do not
copy records into a combined distributed database. Separation is an engineering
boundary, **not a legal determination** that every combined use avoids ODbL
obligations. Confirm the intended distribution complies before publishing. Diary
snapshots and the existing live-provider cache retain their current behavior.

## Al Fresco regression fixture

Archived official API fields were retrieved on 2026-09-29. Apple Maple patty UPC
`030771094625` maps to OFF `0030771094625` and FDC `1892562`:

| Source | Serving | kcal | Protein | Carbs | Fat |
| --- | --- | ---: | ---: | ---: | ---: |
| USDA | 1 patty, 50 g | 90 | 8 g | 4 g | 4 g |
| OFF | 1 patty, 50 g | 90 | 9 g | 5 g | 4 g |

The discrepancy is preserved. Country Style patties and the Apple Maple two-link
package are different products, not nutrition aliases for this barcode.
