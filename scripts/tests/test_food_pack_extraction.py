import importlib.util
import json
import pathlib
import tempfile
import unittest
import zipfile

import duckdb

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "extract-food-packs.py"
spec = importlib.util.spec_from_file_location("extract_food_packs", SCRIPT)
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


class FoodPackExtractionTests(unittest.TestCase):
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
