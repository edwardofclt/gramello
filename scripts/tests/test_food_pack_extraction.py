import importlib.util
import json
import pathlib
import tempfile
import unittest
import zipfile
from unittest.mock import patch
import sys
import io

import duckdb

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "extract-food-packs.py"
spec = importlib.util.spec_from_file_location("extract_food_packs", SCRIPT)
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


class FoodPackExtractionTests(unittest.TestCase):
    def test_download_reuses_complete_file_and_does_not_cache_truncated_source(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = pathlib.Path(directory) / "food.parquet"
            response = io.BytesIO(b"short")
            response.headers = {"Content-Length": "10"}
            with patch.object(extractor.urllib.request, "urlopen", return_value=response):
                with self.assertRaisesRegex(ValueError, "Incomplete source download"):
                    extractor.download("https://example.test/food.parquet", destination)
            self.assertFalse(destination.exists())
            response = io.BytesIO(b"complete")
            response.headers = {"Content-Length": "8"}
            with patch.object(extractor.urllib.request, "urlopen", return_value=response) as request:
                extractor.download("https://example.test/food.parquet", destination)
                extractor.download("https://example.test/food.parquet", destination)
                request.assert_called_once()
            self.assertEqual(destination.read_bytes(), b"complete")

    def test_main_downloads_off_before_extracting_and_can_cache_sources_only(self):
        for download_only in [False, True]:
            with self.subTest(download_only=download_only), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                def fake_download(url, destination):
                    destination.write_bytes(b"source")
                args = [str(SCRIPT), str(root), "--off-revision", "fixture-revision"]
                if download_only:
                    args.append("--download-only")
                with patch.object(sys, "argv", args), patch.object(extractor, "download", side_effect=fake_download) as download, \
                     patch.object(extractor, "extract_usda") as usda, patch.object(extractor, "extract_off") as off:
                    extractor.main()
                self.assertEqual(download.call_count, 2)
                local = root / "off-fixture-revision.parquet"
                self.assertEqual(download.call_args.args[1], local)
                if download_only:
                    usda.assert_not_called()
                    off.assert_not_called()
                else:
                    off.assert_called_once_with(str(local), root / "off.jsonl")

    def test_usda_stream_filters_market_and_preserves_nutrient_units(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            food = {"fdcId": 1892562, "dataType": "Branded", "marketCountry": "United States", "description": "Sausage",
                    "gtinUpc": "030771094625", "servingSize": 50, "servingSizeUnit": "g",
                    "foodNutrients": [{"nutrient": {"id": 1008, "unitName": "kcal", "name": "Energy"}, "amount": 180, "ignored": "derivation"}]}
            with zipfile.ZipFile(root / "usda.zip", "w") as archive:
                archive.writestr("foods.json", json.dumps({"BrandedFoods": [food, {**food, "marketCountry": "Canada"}]}))
            extractor.extract_usda(root / "usda.zip", root / "usda.jsonl")
            rows = [json.loads(line) for line in (root / "usda.jsonl").read_text().splitlines()]
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["foodNutrients"], [{"nutrient": {"id": 1008, "unitName": "kcal"}, "amount": 180}])
            self.assertEqual(rows[0]["servingSize"], 50)

    def test_off_projection_unpacks_structured_names_and_nutrients(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            connection = duckdb.connect()
            connection.execute("""CREATE TABLE foods AS SELECT '0030771094625' code,
                [{'lang':'en','text':'Chicken Breakfast Sausage'}] product_name, 'al fresco' brands,
                ['en:united-states'] countries_tags,
                [{'name':'energy-kcal','100g':180.0},{'name':'proteins','100g':18.0}] nutriments,
                '100g' nutrition_data_per, '50.0' serving_quantity, '1 patty (50 g)' serving_size,
                'g' product_quantity_unit, '7 oz' quantity, 1772292713 last_modified_t,
                false obsolete, false no_nutrition_data, []::VARCHAR[] data_quality_errors_tags""")
            connection.execute("INSERT INTO foods SELECT * REPLACE (['en:canada'] AS countries_tags) FROM foods")
            connection.execute("COPY foods TO ? (FORMAT PARQUET)", [str(root / "food.parquet")])
            connection.close()
            extractor.extract_off(str(root / "food.parquet"), root / "off.jsonl")
            rows = [json.loads(line) for line in (root / "off.jsonl").read_text().splitlines()]
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["product_name"], "Chicken Breakfast Sausage")
            self.assertEqual(rows[0]["nutriments"], {"energy-kcal_100g": 180.0, "proteins_100g": 18.0})
            self.assertEqual(rows[0]["code"], "0030771094625")


if __name__ == "__main__":
    unittest.main()
