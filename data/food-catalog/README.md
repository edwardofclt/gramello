# Offline food catalog

The bundled `mobile/assets/catalog.sqlite` contains 50,322 foods: 7,793 USDA FoodData Central SR Legacy foods and all 42,529 foods in the 150 restaurant catalogs listed by [`docs/restaurant-import/import-summary.json`](../../docs/restaurant-import/import-summary.json). The same inputs are used for signed catalog releases. Search and food details work offline. The database uses FTS5 and schema version 1, and is 40,558,592 bytes.

The USDA foods are a normalized April 2018 SR Legacy snapshot with calories, protein, carbohydrates and fat per 100 g and a published household portion where available. Source: [USDA SR Legacy April 2018 JSON](https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip), retrieved 2026-09-22. USDA publishes FoodData Central data under [CC0](https://fdc.nal.usda.gov/api-guide/). Citation: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019. This snapshot has no barcode coverage.

`usda-serving-defaults.json` preserves all usable household portions from the same published USDA records and selects a practical default. The importer prefers named portions (such as an egg, slice, piece, or fillet) over cups, weights, and yield descriptions; large is preferred for eggs and medium/regular for other sized foods. Labeled product servings are preserved. Each source count and gram weight stays paired, including fractional or multi-piece portions. No item weights or nutrient values are inferred. Foods without a suitable named portion keep their existing household measure or 100 g fallback.

For example, whole raw egg defaults to **1 large (50 g)**, banana to **1 medium (118 g)**, and apple to **1 medium (182 g)**. Rice retains its cup measure. Catalog builds apply this serving index to `usda-core.json`. App catalog reads and browser USDA lookups apply it too, so older bundled/installed catalogs receive the same defaults. Existing diary entries and saved recipe snapshots retain their recorded portions.

The serving-size picker uses a shared portion model for all foods with published alternatives, including slices, pieces, cups, and size variants. The default appears first; the other USDA portions remain available. Quantity multiplies the chosen portion: two medium eggs are 88 g, while two large eggs are 100 g. Weight and volume entry remain available where supported. Foods whose source provides only one serving keep that serving without fabricated alternatives. Logging resolves portion IDs against the source food; recipes retain the selected portion and its nutrition snapshot.

Regenerate both the normalized USDA data and the serving index from the downloaded official ZIP:

```sh
python3 scripts/import-usda.py /path/to/FoodData_Central_sr_legacy_food_json_2018-04.zip \
  /tmp/usda-core.json --servings-output data/food-catalog/usda-serving-defaults.json
```

The portion policy lives in `scripts/import-usda.py`; the index's `source` field identifies the underlying dataset. Review the generated changes before replacing checked-in source snapshots.

Restaurant items retain the IDs, names, serving descriptions, per-serving nutrients, optional serving weights, source URLs, source kind, and retrieval dates from the previously imported catalogs. Each row carries its restaurant name as its brand. The imported sources comprise 31,950 Nutritionix database entries and 10,579 entries from official restaurant nutrition sources. Individual source URLs, source dates, and retrieval dates are in [`data/restaurant-foods`](../restaurant-foods) and the [import summary](../../docs/restaurant-import/import-summary.json). These restaurant sources have their own terms; the combined catalog is **not** all CC0. The database's `catalog_meta` records the mixed provenance. Menu nutrition can change after a snapshot was retrieved.

Rebuild the bundled seed from the checked-in inputs:

```sh
node scripts/food-catalog.mjs offline /tmp/gramello-offline.sqlite offline-2026-09-v1
```

The importer rejects missing nutrients and duplicate IDs. UPC/EAN barcode keys in future approved data are canonicalized to 14-digit strings so leading zeros survive. The database contains no user diary or account data.
