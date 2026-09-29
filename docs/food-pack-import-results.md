# First full US-market import — 2026-09-29

The complete official source extracts were normalized and imported locally into
256 separate-source SQLite packs. Production publication has **not** occurred;
the app needs a signed release built with the existing trusted key before it can
automatically download this expansion in production.

| Source | US-market input rows | Valid unique foods | Rejected rows |
| --- | ---: | ---: | ---: |
| USDA Global Branded | 446,502 | 300,574 | 145,928 |
| Open Food Facts | 976,415 | 708,211 | 268,202 |

OFF also had two duplicate identities, retained once. Rejections include missing
names/macros, invalid GTINs/check digits, discontinued/obsolete products, quality
errors, implausible per-100 values and unsupported or oversized fields.

Total: **1,008,785 foods**, **737,927,168 bytes** (about 704 MiB). Largest pack:
4,157,440 bytes; the compatibility limit is 32 MiB. USDA and OFF databases,
including their search and barcode indexes, remain physically separate. Forty-one
USDA records lacked a brand name; their source-dataset tag still classifies them
as packaged foods without inventing a brand.

## Reproducible source snapshots

- USDA: [April 2026 branded JSON ZIP](https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_json_2026-04-30.zip),
  SHA-256 `57b0f122e61cf2840f03c11e9520275d0d2018dc036e16273fcd3cd370db2256`.
- OFF: official [food Parquet at revision 5ac8dbc2a2b1978924686e11798fe136eb13902a](https://huggingface.co/datasets/openfoodfacts/product-database/resolve/5ac8dbc2a2b1978924686e11798fe136eb13902a/food.parquet).

Final local files are in `.catalog-work/packs-final/`, with `pack-set.json`,
`import-report.json`, `verification-report.json` and the 256 databases. Raw
datasets and all generated databases are ignored by git. The manifest is unsigned
locally; no replacement production trust key was generated.

## Full-catalog verification

`node scripts/verify-food-packs.mjs .catalog-work/packs-final` inspected every
database and food record, checked source/license/schema/counts and SHA-256, and
queried the actual data using the same SQLite WASM memory reader as the browser.

| Check | Result |
| --- | --- |
| Full record inspection | Passed, approximately 10 seconds |
| Maximum simultaneously open expansion databases | 1 |
| Al Fresco UPC `030771094625` | USDA `usda-1892562`, approximately 3 ms |
| `alfresco breakfast chicken sausage` | 9 matches, approximately 2.48 seconds |
| `al fresco apple maple sausage` | Both source alternatives, approximately 2.44 seconds |
| USDA 50 g patty | 90 kcal, 8 g protein, 4 g carbs, 4 g fat |
| OFF 50 g patty | Separate record: 90 kcal, 9 g protein, 5 g carbs, 4 g fat |

These are local Node 24 WASM timings, not phone/browser performance guarantees.
On-device suspension, filesystem behavior and constrained-browser storage still
need deployment validation. Source/licensing guidance and the signed-release
workflow are described in [food-packs.md](food-packs.md).

## Application verification

The final application tree passed all 627 tests in 53 test files. Web TypeScript,
mobile TypeScript and the production build passed. The two Python source-extraction
tests also passed. Lint had zero errors and three existing warnings unrelated to
this import. The final whitespace check passed.

The full-source import and WASM inspection are separate checks from the fixture
tests: they verify the actual generated million-food catalog, not just the Al
Fresco sample. Physical-device and end-to-end browser deployment checks have not
been performed.

## Review decisions and limits

1. Preserve newer cached OFF nutrition over older OFF snapshots with the same ID,
   while USDA wins across sources for a barcode. The cost is that an OFF result
   may use newer community values than the downloaded snapshot.
2. Do not publish from this worktree or replace the trusted key. The cost is that
   production automatic expansion downloads remain unavailable until release.
3. Physical source separation is not a legal determination. OFF-derived packs,
   attribution and recipes are prepared for ODbL distribution; additional license
   or distribution changes may be required after reviewing the intended use.
4. Shared tests and native type checks do not prove OS suspension or filesystem
   durability on real devices; device-only behavior may differ.
5. Full pack search was benchmarked with actual WASM. Slower devices may need a
   secondary search index if this latency is not acceptable.

The independent review's three important findings were reproduced and fixed with
failing-then-passing tests: avoid scanning all branded packs for a core food,
preserve old coverage during incomplete repartitioning, and prevent a stale
browser tab from retiring another tab's newer installation. No minor findings
were deferred.
