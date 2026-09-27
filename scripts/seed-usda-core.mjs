// Generate idempotent D1 SQL: node scripts/seed-usda-core.mjs > /tmp/usda-core.sql
// Apply after migrations with wrangler d1 execute <database> --file /tmp/usda-core.sql.
import { readFileSync } from 'node:fs';
const foods = JSON.parse(readFileSync(new URL('../data/food-catalog/usda-core.json', import.meta.url), 'utf8'));
const quote = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
for (const food of foods) {
  if (!/^usda-\d+$/.test(food.id) || !food.verified || food.sourceKind !== 'database') throw new Error('Invalid approved USDA row');
  const values = [food.id,food.name,food.brand,food.source,food.sourceKind,food.sourceUrl,1,food.nutritionBasis,food.servingGrams,food.servingMl,food.servingLabel,food.calories,food.protein,food.carbs,food.fat,food.image,food.checkedAt,'2026-09-25'];
  // Existing canonical records always win, including fresher provider nutrition.
  process.stdout.write(`INSERT INTO foods(id,name,brand,source,source_kind,source_url,verified,nutrition_basis,serving_grams,serving_ml,serving_label,calories,protein,carbs,fat,image,checked_at,created_at) VALUES(${values.map(quote).join(',')}) ON CONFLICT(id) DO NOTHING;\n`);
}
