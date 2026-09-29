# US-market branded food expansion

Approved scope: retain the existing core/restaurant SQLite catalog and add USDA
Global Branded Food Products plus Open Food Facts US-market products. Automatically
download signed expansion packs on launch/foreground, including cellular networks.

## Data contract

- Accept USDA `marketCountry=United States` and OFF `en:united-states` country tags.
- Require a name, valid GTIN string, and all four finite nonnegative macros. Missing
  nutrients are not zero. Keep source nutrient bases and printed serving sizes;
  never infer a liquid's density. Reject implausible per-100 values.
- Keep `usda-<fdcId>` and `off-<code>` identities and source URLs. UPC/EAN variants
  share a zero-padded 14-digit barcode index, not a food identity.
- Preserve source disagreements. Prefer USDA branded over OFF for barcode lookup;
  retain both in name search. Fresh cached OFF values still supersede older OFF
  values with the same identity, but cannot supersede a USDA barcode match.
- Keep OFF-derived databases physically separate and publish their attribution,
  ODbL license and reproducible extraction recipe. This is not a legal opinion.

## Distribution and storage

Use a separate signed pack-set manifest (schemaVersion 2), keeping the legacy
manifest intact. Each source is partitioned into SQLite packs, maximum 32 MiB
each, with the existing database schema, FTS search and barcode indexes. Source
packs are independently versioned by content and activated only after signature,
length, SHA-256, schema, identity and food-field checks. Sequential downloads
checkpoint each successful pack; failed packs preserve their previous versions
and do not block the other source. Retire old packs only after a complete set is
installed. Exponential retries use the existing hourly-to-daily backoff.

Native stores packs in a separate document directory. Browser stores each pack
and its descriptor in one IndexedDB transaction. Pack readers open only one
expansion SQLite database at a time, then close it. Bundled foods and personal
diaries remain independent of expansion availability.

## Verification subject

Al Fresco Apple Maple breakfast patty: UPC `030771094625`, OFF
`0030771094625`, USDA FDC `1892562`. At 50 g: USDA 90 kcal / 8 g protein /
4 g carbs / 4 g fat; OFF 90 kcal / 9 g protein / 5 g carbs / 4 g fat. Keep the
Country Style and two-link packages separate. Verify name search, leading-zero
barcode lookup, scaled servings, source precedence, interrupted updates and
offline reuse using archived API fixtures and real SQLite readers.

## Release boundary

Prepare and test download/import/build/sign/release tooling locally. Publishing
requires the existing matching `CATALOG_SIGNING_KEY` and repository release
permissions. Do not generate a replacement trust key or publish from this task.
