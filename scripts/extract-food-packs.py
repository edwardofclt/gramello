"""Stream official USDA JSON ZIP and OFF Parquet into compact raw US-product JSONL.

Run with the pinned requirements in food-packs-requirements.txt. Normalization and
strict nutrition validation happen in the shared TypeScript importer afterward.
"""
import argparse
import hashlib
import json
import pathlib
import urllib.request
import zipfile

USDA_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_json_2026-04-30.zip"
OFF_REVISION_API = "https://huggingface.co/api/datasets/openfoodfacts/product-database/revision/main"


def download(url, destination):
    if destination.exists():
        return
    partial = destination.with_suffix(destination.suffix + ".partial")
    request = urllib.request.Request(url, headers={"User-Agent": "GramelloCatalog/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    partial.replace(destination)


def extract_usda(archive, output):
    import ijson
    fields = ["fdcId", "dataType", "description", "marketCountry", "gtinUpc", "brandName", "brandOwner", "discontinuedDate",
              "servingSize", "servingSizeUnit", "householdServingFullText", "publicationDate", "modifiedDate", "foodNutrients"]
    with zipfile.ZipFile(archive) as zipped, output.open("w") as target:
        members = [name for name in zipped.namelist() if name.endswith(".json")]
        if len(members) != 1:
            raise ValueError("USDA archive must contain exactly one JSON dataset")
        with zipped.open(members[0]) as stream:
            for food in ijson.items(stream, "BrandedFoods.item", use_float=True):
                if food.get("marketCountry") == "United States":
                    compact = {key: food[key] for key in fields if key in food}
                    compact["foodNutrients"] = [{"nutrient": {"id": item.get("nutrient", {}).get("id"), "unitName": item.get("nutrient", {}).get("unitName")},
                                                 "amount": item.get("amount")} for item in food.get("foodNutrients", [])]
                    target.write(json.dumps(compact, separators=(",", ":")) + "\n")


def extract_off(parquet_url, output):
    import duckdb
    connection = duckdb.connect()
    connection.execute("SET memory_limit='512MB'; SET threads=2;")
    fields = ["code", "product_name", "brands", "countries_tags", "nutriments", "nutrition_data_per", "serving_quantity",
              "serving_size", "product_quantity_unit", "quantity", "last_modified_t", "obsolete", "no_nutrition_data", "data_quality_errors_tags"]
    result = connection.execute(f"SELECT {','.join(fields)} FROM read_parquet(?) WHERE list_contains(countries_tags, 'en:united-states')", [parquet_url])
    with output.open("w") as target:
        while rows := result.fetchmany(1000):
            for row in rows:
                food = dict(zip(fields, row))
                names = food.get("product_name") or []
                food["product_name"] = next((entry.get("text") for entry in names if entry.get("lang") == "en"),
                                            next((entry.get("text") for entry in names if entry.get("lang") == "main"), ""))
                food["nutriments"] = {f"{entry['name']}_100g": float(entry["100g"]) if entry.get("100g") is not None else None for entry in food.get("nutriments") or []}
                target.write(json.dumps(food, separators=(",", ":")) + "\n")
    connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=pathlib.Path)
    parser.add_argument("--usda-url", default=USDA_URL)
    parser.add_argument("--off-revision")
    parser.add_argument("--off-parquet", help="Local Parquet fixture or exact pinned remote URL")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    archive = args.output / pathlib.Path(args.usda_url).name
    download(args.usda_url, archive)
    extract_usda(archive, args.output / "usda.jsonl")
    print("USDA US-market extraction complete", flush=True)
    revision = args.off_revision
    if not revision and not args.off_parquet:
        with urllib.request.urlopen(OFF_REVISION_API, timeout=30) as response:
            revision = json.load(response)["sha"]
    off_url = args.off_parquet or f"https://huggingface.co/datasets/openfoodfacts/product-database/resolve/{revision}/food.parquet"
    extract_off(off_url, args.output / "off.jsonl")
    print("Open Food Facts US-market extraction complete", flush=True)
    provenance = {"usda": {"url": args.usda_url, "sha256": hashlib.file_digest(archive.open("rb"), "sha256").hexdigest()},
                  "off": {"url": off_url, "revision": revision}}
    (args.output / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")


if __name__ == "__main__":
    main()
