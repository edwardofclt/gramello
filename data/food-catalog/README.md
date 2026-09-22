# Distributable USDA catalog

`usda-core.json` is a normalized snapshot of 7,793 USDA FoodData Central SR Legacy foods. It contains published calories, protein, carbohydrates and fat per 100 g, with a published household portion where available. It is not a current comprehensive branded/barcode database. The importer rejects incomplete nutrients rather than substituting zero.

Source: [USDA SR Legacy April 2018 JSON](https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip), retrieved 2026-09-22. USDA publishes FoodData Central data as public domain under [CC0](https://fdc.nal.usda.gov/api-guide/). Citation: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019.

Reproduce normalization:

```sh
python3 scripts/import-usda.py downloaded-usda-sr.zip data/food-catalog/usda-core.json
node scripts/food-catalog.mjs data/food-catalog/usda-core.json /tmp/gramello-starter.sqlite usda-sr-2018-v1
```

The bundled `mobile/assets/catalog.sqlite` was built by that command and is approximately 4.9 MB. It uses FTS5 and schema version 1. UPC/EAN barcode keys in future approved data are canonicalized to 14-digit strings so leading zeros survive. This particular USDA snapshot does not provide barcode coverage.

Restaurant snapshots elsewhere in this repository are deliberately excluded from these distributable artifacts pending redistribution review. This folder contains no user diary or account data.
